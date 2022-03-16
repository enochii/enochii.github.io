---
layout: mypost
title: JOS之中断和系统调用
categories: [OS, mit6.828]
---

lab 3 断断续续写了小久，终于糊完了。虽然没能完全独立地解决所有实现细节，但对 JOS 系统调用的实现有了点理解，在此做下记录。

### Interrupt & Exception

> 后文当提到中断，它可能包括 Interrupt 和 Exception ，也可能单指 Interrupt ，视上下文而定。

JOS 的系统调用是利用类似中断的机制实现的，即：

- 保存当前进程的上下文，主要是各种寄存器
- 陷入内核，根据中断向量（一个小整数）来确定处理程序的入口
- 调用处理程序，获得结果
- 如果中断和异常能被正确处理，恢复进程上下文，程序继续执行

> 关于中断部分的介绍也可以跳过

lab 3 让我们阅读 Intel 中断部分的手册，相关术语在各种架构之间并没有很多的统一，下面会基于 Intel 资料简单介绍下中断。

一般说中断，我们会包括 Interrupt 和 Exception ，Interrupt 可分为：

- external (hardware generated) interrupt
- software generated interrupt ，通过 `INT n` 指令触发

Exception 则一般是在程序执行过程中被触发，比如当执行指令时访问了一个地址发生缺页异常。还有一类称为软中断（software interrupt），即通过指令显示地触发，它包括了上面 Interrupt 的第二种分类。这两种分类标准分别出现于下面两个 6.828 提供的文档，有点自相矛盾但无伤大雅。

> 参考：
>
> - [1]
> - [2] 5.3 Sources of Interrupts

综上，一般异常是*同步*的，一般是程序（不自觉或自觉地）主动触发中断机制；而由硬件触发的中断是*异步*的，比如一个时间中断突然把一个程序的执行流打断。

### 中断向量表

上面提到异常和中断的处理是用的同一套机制，这其中有一个很重要的概念叫中断向量表（Interrupt Descriptor Table 简称 IDT），其实是一个数组。不同中断、异常都需要对应的处理程序（handler），IDT 的一项就对应着一个处理程序，由一个小整数标识。

IDT 有 256 项，0-31 被 Intel 保留，比如 0 是 divide by zero ；32-255 开放给用户自定义，通常用于处理外部的硬件中断。

>[2]  5.2 EXCEPTION AND INTERRUPT VECTORS 
>
>Vectors in the range 32 to 255 are designated as user-defined interrupts and are not reserved by the Intel 64 and IA-32 architecture. These interrupts are generally assigned to external I/O devices to enable those devices to send interrupts to the processor through one of the external hardware interrupt mechanisms (see Section 5.3, “Sources of Interrupts”). 

0-31 除去一些保留的以及 NMI ，大部分都是异常，可查看 [2]  Table 5-1. Protected-Mode Exceptions and Interrupts 。

JOS 使用了 48(0x30) 作为系统调用的中断向量，使得我们可以像处理异常、中断一样处理系统调用。

### 系统调用流程

这一节我们从一个系统调用入手，来观察整个过程是如何发生的。

#### 用户与内核的边界

这个系统调用是位于 `lib/syscall.c` 的 `sys_cputs` ，其定义为：

```c
int
sys_cgetc(void)
{
	return syscall(SYS_cgetc, 0, 0, 0, 0, 0, 0);
}
```

这里调的 `syscall` 是同文件下的一个 static function （只在当前文件下可见，所以用户无法直接调用，一种保护、隔离内核的手段）：

```c
static inline int32_t
syscall(int num, int check, uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4, uint32_t a5)
{
	int32_t ret;

	// Generic system call: pass system call number in AX,
	// up to five parameters in DX, CX, BX, DI, SI.
	// Interrupt kernel with T_SYSCALL.
	//
	// The "volatile" tells the assembler not to optimize
	// this instruction away just because we don't use the
	// return value.
	//
	// The last clause tells the assembler that this can
	// potentially change the condition codes and arbitrary
	// memory locations.

	asm volatile("int %1\n"
		     : "=a" (ret)
		     : "i" (T_SYSCALL),
		       "a" (num),
		       "d" (a1),
		       "c" (a2),
		       "b" (a3),
		       "D" (a4),
		       "S" (a5)
		     : "cc", "memory");

	if(check && ret > 0)
		panic("syscall %d returned %d (> 0)", num, ret);

	return ret;
}
```

这里使用了内联汇编，我们把 `num` 系统调用号放入了 `%eax` ，参数 1-5 放入了 `%eds` 等寄存器（见注释）。然后执行指令 `int $T_SYSCALL` ，接下来发生的事情就是中断机制那一套了，这里便是用户和内核之间的**边界**。最终我们会把系统调用的返回值放在变量 `ret` 中。

#### 中断向量表初始化

> 这一节不感兴趣可以先行跳过 

在 `int $T_SYSCALL` 之后，我们需要去 IDT 中寻找第 `T_SYSCALL` 即 48 个表项作为中断处理程序。在此前，我们可以稍微说下 JOS 的中断向量表是如何初始化的。

在 `kern/trap.c` `trap_init.c` 中，通过 `SETGATE` 宏为每个中断向量逐个设置处理程序。

```c
SETGATE(idt[T_DIVIDE], 0, GD_KT, trap_handler_divide, 0);
SETGATE(idt[T_DEBUG], 0, GD_KT, trap_handler_debug, 0);
SETGATE(idt[T_NMI], 0, GD_KT, trap_handler_nmi, 0);
```

这里的 `trap_hanlder_divide` 就是一个处理程序，你也不会找到它的函数体，它是利用 `TRAPHANDLER_NOEC(trap_handler_divide, 0)` 宏定义的：

```c
/* Use TRAPHANDLER_NOEC for traps where the CPU doesn't push an error code.
 * It pushes a 0 in place of the error code, so the trap frame has the same
 * format in either case.
 */
#define TRAPHANDLER_NOEC(name, num)					\
	.globl name;							\
	.type name, @function;						\
	.align 2;							\
	name:								\
	pushl $0;							\
	pushl $(num);							\
	jmp _alltraps
```

这里的 `num` 是 0 ，它是除零错误的中断向量。 `push $0` 是压了一个伪 error code ，因为对于一些异常 CPU 不会为我们压入 error code ，为了保持一致我们压了一个 0 。`TRAPHANDLER_NOEC` 的变体是 `TRAPHANDLER` （会压入 error code）。所有的中断处理程序都是用这两个宏（`TRAPHANDLER_NOEC` 和 `TRAPHANDLER`）定义的，它们都会 jump 到 `_alltraps` 这个统一入口点。这个入口点会建立 trap frame ，保存进程的上下文。

#### trap frame

##### 定义

在处理包括系统在内的中断之前，我们需要保存当前进程的上下文，即进程的“状态”，主要是各种寄存器，这样在中断处理结束后我们可以让进程继续从当前上下文继续执行。

在 JOS 中，进程状态的定义是 `struct Trapframe`，可以注意到 trap frame 是由 hardware 和 kernel 共同构建的：

```c
struct Trapframe {
	struct PushRegs tf_regs; // all registers that pushed by `pusha` instruction
	uint16_t tf_es;
	uint16_t tf_padding1;
	uint16_t tf_ds;
	uint16_t tf_padding2;
	uint32_t tf_trapno;
	/* below here defined by x86 hardware */
	uint32_t tf_err;
	uintptr_t tf_eip;
	uint16_t tf_cs;
	uint16_t tf_padding3;
	uint32_t tf_eflags;
	/* below here only when crossing rings, such as from user to kernel */
	uintptr_t tf_esp;
	uint16_t tf_ss;
	uint16_t tf_padding4;
} __attribute__((packed));
```

##### 构建

在中断向量表初始化时我们提到 `_alltraps` 这个中断的统一入口点：

```c
.global _alltraps
_alltraps:
	# build trap frame
	pushl %ds
	pushl %es
	pushal

	# set up ds es
	movw $GD_KD, %ax
	movw %ax, %ds
	movw %ax, %es
	# call trap(tf)
	pushl %esp
	call trap
```

头三条指令建立 trap frame ，后面切换了段寄存器。`pushl %esp` 这个有点小 trick ，当前 `%esp` 指向栈顶，栈顶包含了各种寄存器。结合 C 的 calling convention ，其实是把 `%esp` 作为参数作为 `trap(tf)` 的参数进行了一个调用。

`trap(tf)` 调用了 `trap_dispatch(tf)` ，进行中断的分发：

```c
static void
trap_dispatch(struct Trapframe *tf)
{
	// Handle processor exceptions.
	switch (tf->tf_trapno)
	{
	case T_PGFLT:
		/* code */
		page_fault_handler(tf);
		return;
	case T_BRKPT:
	case T_DEBUG:
		monitor(tf);
		return;
	case T_SYSCALL:
		syscall_handler(tf);
		return;
	
	default:
		break;
	}

	...
}
```

根据 trap frame 的 `tf_trapno` ，我们找到对应的处理程序。对于系统调用，就是我们的 `syscall_handler` 。

#### system call handler

注意到在[用户与内核的边界](#用户与内核的边界)这一节的内联汇编中，我们在执行 `int $T_SYSCALL` 之前还设置了寄存器，包括系统调用号和系统调用的参数，在用户态陷入内核前，我们将这些信息保存在进程的寄存器。于是在 `_alltraps` 的 `pushal` ，这些信息借由寄存器就被放在 trap frame 中了。

所以在系统调用的处理程序中，我们通过 `tf` 获取这些参数，然后执行一个 `syscall()`，并把返回值放回 trap frame 的 `%eax` 寄存器中。在进程恢复执行后，返回值就位于 `%eax` 中，相当于执行了一次函数调用。

```c
void syscall_handler(struct Trapframe *tf)
{
	int num = tf->tf_regs.reg_eax;
	int a1  = tf->tf_regs.reg_edx;
	int a2  = tf->tf_regs.reg_ecx;
	int a3  = tf->tf_regs.reg_ebx;
	int a4  = tf->tf_regs.reg_edi;
	int a5  = tf->tf_regs.reg_esi;
	int ret = syscall(num, a1, a2, a3, a4, a5);

	// when resume user process, it can get return
	// value directly by accessing %eax
	tf->tf_regs.reg_eax = ret;
}
```

这里的 `syscall` 要和前面的区分开，它位于 `kern/syscall.c` 中：

```c
// Dispatches to the correct kernel function, passing the arguments.
int32_t
syscall(uint32_t syscallno, uint32_t a1, uint32_t a2, uint32_t a3, uint32_t a4, uint32_t a5)
{
	// Call the function corresponding to the 'syscallno' parameter.
	// Return any appropriate return value.
	switch (syscallno) {
		case SYS_cputs:
			sys_cputs((char*)a1, a2);
			return 0;
		case SYS_cgetc:
			return sys_cgetc();
		case SYS_getenvid:
			return sys_getenvid();
		case SYS_env_destroy:
			return sys_env_destroy(a1);
	default:
		return -E_INVAL;
	}
}
```

咦，这里的 `sys_cputs()` 不就是我们一开始说的那个系统调用吗？不是，这是 `kern/syscall.c` 下的一个 static function：

```c
static int
sys_cgetc(void)
{
	return cons_getc();
}
```

### 总结

最终，我们可以给出这么一个系统调用的流程图：

![系统调用流程](syscall.png)

### Reference

[1] https://pdos.csail.mit.edu/6.828/2018/readings/i386/c09.htm 

[2]  https://pdos.csail.mit.edu/6.828/2018/readings/ia32/IA32-3A.pdf 