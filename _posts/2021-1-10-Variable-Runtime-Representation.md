---
layout: mypost
title: Variable, Runtime stack and VM
categories: [Compiler, VM]
---

## 背景和需求

名字有点不知所以，先说下本文大致的背景和需求。类似 Python 这样的解释器大致分为两块，编译时和解释运行时。即先把源码编译成字节码，最后逐条解释运行字节码。简单来说，我们有 compiler（scanner+parser）和 VM（字节码解释器）。

<img src="3.jpg" alt="index" style="zoom:50%;" />

另外这里的 VM 是栈式虚拟机，即解释运行字节码时，会有一个辅助栈来保留一些操作数和中间结果。比如对于 1 + 2 * 3 ，字节码大概是：

```shell
OP_CONST 2  # 把 2 压栈
OP_CONST 3  # 把 3 压栈
OP_MULTIPLY # 取出2 3，乘法得 6，把 6 压栈
OP_CONST 1  # 把 1 压栈
OP_PLUS		# 取出 6 1，加法得 7，把 7 压栈
```

可以看到，表达式（包括子表达式）会临时把操作数和计算结果放在栈上。

以上仅是常量，那对于**变量**我们又该如何建模呢？变量的表示决定了我们如何定义、解析（读写）变量。此外，我们希望能支持 *lexical scope* 即静态作用域。

## 变量的表示

### Store Variable in Stack

对于以下代码：

```javascript
var a = 1 + 2;
var b = 3 * 4;
```

前端会吐出如下字节码：

```
OP_CONST 1
OP_CONST 2
OP_PLUS
# code for definition of variable a

OP_CONST 3
OP_CONST 4
OP_MULTIPLY
# code for definition of variable b
```

直觉上，对于字节码的生成，我们会先生成等式右侧初始表达式的字节码（运行时执行这些字节码后，结果会放在栈顶，这也是变量的初值）；接着，我们会将变量和值绑定起来，比如用一个 `map<string, Value>` 来记录，这部分也需要前端吐出相应的字节码。

现在，我们先不要考虑第二部分即变量定义，执行以上 6 条字节码，运行时栈（辅助栈）的变化如下（右侧）：

```shell
|	CODE	|	STACK	|
OP_CONST 1   [1]
OP_CONST 2	 [1][2]
OP_PLUS		 [3]

OP_CONST 3	 [3][3]
OP_CONST 4	 [3][3][4]
OP_MULTIPLY  [3][7]
```

你会发现，字节码执行结束后，栈顶存放的刚好是 `a` 和 `b` 的初值，所以有没有可能我们把运行时栈用来存放局部变量呢？后续读写 `a` `b` 直接读写运行时栈即可。答案是可以。

这其实意味着我们会把变量名字**映射**到运行时栈（数组）的下标。在编译时如果涉及对变量的读写，我们会解析出对应的下标，然后放在字节码中，比如 `a + b` ：

```shell
OP_GET_LOCAL 0 # stack[0]
OP_GET_LOCAL 1 # stack[1]
OP_PLUS
```

这样一来，在运行时就可以根据下标（这里的 0 1）读取变量的值。回到字节码生成，其实对于 `var a = 1;` ，我们现在的思路只需要生成（即只生成了等式右侧常量 1 的字节码）：

```
OP_CONST 1
```

不难理解，对于嵌套的 scope ，上面的做法也是行得通的。

### Resolving at Compile Time

其实前面我们忽略了一点，就是在字节码生成时，`a + b` 中变量的下标是怎么算出来的。要做到这点，我们需要在编译时简单模拟下运行时栈的行为。可以参考[这里]( http://www.craftinginterpreters.com/local-variables.html#representing-local-variables )，我们用 `struct Local` 来表示一个局部变量。

```c
typedef struct {
  Token name; // variable name
  int depth; // scope depth
} Local;
```

用 `struct Compiler` 来建模 scope ：

```c
typedef struct {
  Local locals[UINT8_COUNT];
  int localCount; // how much local variables
  int scopeDepth; // current scope depth, global is 0
} Compiler;
```

简单来说，就是在编译时会有一个 *locals* 数组，当发生一个变量定义时，我们将其加入 *locals* 数组，这样相当于把变量名字和这个下标绑定起来。这样，当我们在编译 `a+b` 时，直接来 *locals* 数组中通过名字对比来查找下标即可。

在退出 scope 时，则从后往前扫描 *locals* ，把所有属于当前 scope 的变量全部删除。

这种 scope 建模和我们之前用嵌套 map 的方式是不同的，区分变量是否为不同 scope 的信息是通过 `Local.depth` 表明的。

### 信息的“丢失”

在编译成字节码后，其实变量名字是丢失的，这有点像汇编中用基于栈的偏移地址去表示一个局部变量。如果需要这部分信息，这可以补一个数组，将下标重新映射回变量名字即字符串。

## 不足

思路确实是对的，但对于每一次变量的读写，在编译时我们都需要对 *locals* 数组进行一个从前往后的线性扫描。从前往后是由我们的作用域规则决定的。线性扫描中都要不断地对字符串进行比对，性能比较差，那有没有什么别的方法呢？

这其实也是 tutorial 的[Chanllenge 1]( http://www.craftinginterpreters.com/local-variables.html#challenges ) ：

>Our simple local array makes it easy to calculate the stack slot of each local variable. But it means that when the compiler resolves a reference to a variable, we have to do a linear scan through the array.
>
>Come up with something more efficient. Do you think the additional complexity is worth it?

第一个冒出的想法应该就是利用哈希表了，但得注意嵌套 scope 的情况。

## 同名变量链表

一个思路是，将一个变量名字映射到一个链表，这个链表存放了所有现存同名变量信息，并且是链表头是最新的一个绑定。链表的“链接指针”放在 `Local` 中，即

```c
typedef struct {
    Token name;
    int scopeDepth;
    // link to the previous variable with same name,
    // and localIndex is for Compiler.locals array
    int lastIndex;
} Local;
```

`lastIndex` 是 *locals* 数组中上一个同名变量的下标。

假设我们有如下代码：

```javascript
var a = 1;
{
    var a = 2;
    {
        var a = 3;
        // [1]
    } // exiting scope, clean `var a = 3` definition
    // [2]
}
```

当编译进行到 [1] 处时，locals 数组会有三个变量，对应的下标分别是 0 1 2。我们的哈希表中存放的映射是：

![hash table](1.jpg)

来到 [2] 处，`var a = 3` 定义已经被清除，哈希表中的映射 "a" 会被调整为：

![hash table](2.jpg)

借此，我们就完成了对 scope 的建模。在 [1] 处读写变量通过哈希表获得的下标是2，对应的为最内层定义 `var a = 3` 。

## const 修饰符

这里可以顺手做一下第三题：

>Many languages make a distinction between variables that can be reassigned and those that can’t. In Java, the `final` modifier prevents you from assigning to a variable. In JavaScript, a variable declared with `let` can be assigned but one declared using `const` can’t. Swift treats `let` as single-assignment and uses `var` for assignable variables. Scala and Kotlin use `val` and `var`.
>
>Pick a keyword for a single-assignment variable form to add to Lox. Justify your choice, then implement it. An attempt to assign to a variable declared using your new keyword should cause a compile error.

这里要支持 *const* 修饰符也是比较简单的，在 `Local` 定义中加入一个 bool 变量即可：

```c
typedef struct {
    Token name;
    int scopeDepth;
    // link to the previous variable with same name,
    // and localIndex is for Compiler.locals array
    int lastIndex;
    bool const;
} Local;
```

在写变量前先判断一个变量是否有 *const* 修饰符，大功告成~

## 总结

本文简单介绍了如何通过运行时栈来存储局部变量，为了加速编译时的词法地址解析，我们将变量名字映射到『同名变量链表』，从而避免了线性扫描。

## Reference

http://www.craftinginterpreters.com/local-variables.html#representing-local-variables