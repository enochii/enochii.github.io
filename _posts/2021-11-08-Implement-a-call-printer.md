---
layout: mypost
title: Implement a simple call printer(UCAS compiler assignment 2)
categories: [compiler, program-analysys, LLVM]
---

Haven't written blogs for a long time, mainly because of lack of input and being lazy... Also this blog is written in english though my english is poor, I will try my best to be clear enough. And you are free to point out what's going wrong...

Well, This blog will talk about some thoughts when I do the assignment 2 of UCAS compiler(graduate course). The code will be published [here](https://github.com/enochii/call-printer)

This assignment require us to resolve all possible callees in every callsite. There are 2 cases here, direct call and indirect call by function pointers. At first, I think it is a simple data flow analysis problem, and we do not need to handle LOAD/STORE statement. With LLVM IR in SSA form, we can track use-def chain to find the callee set of a pointer. In this way, we can even get flow sensitivity out of box.

Then you will find you can not pass `test14.c`, which kind of needs a bit of "path sensitivity". See the below code, to get the commented answer at the end, we need to execute 2 branches separately. Then when the control flow reach the second callsite, there are 2 cases:

case 1:

- `s_fptr` = plus
- `a_fptr` = plus
- `goo+ptr` = foo

case 2:

- `s_fptr` = minus
- `a_fptr` = plus
- `goo+ptr` = clever

So the return value of callsite 2 will always be "plus", which is the target method of callsite 3.

```c
int (*foo(int a, int b, int (*a_fptr)(int, int), int(*b_fptr)(int, int) ))(int, int) {
   return a_fptr;
}
int (*clever(int a, int b, int (*a_fptr)(int, int), int(*b_fptr)(int, int) ))(int, int) {
   return b_fptr;
}
int moo(char x, int op1, int op2) {
    int (*a_fptr)(int, int) = plus;
    int (*s_fptr)(int, int) = minus;
    int (* (*goo_ptr)(int, int, int (*)(int, int), int(*)(int, int)))(int, int)=foo;
    int (*t_fptr)(int, int) = 0;

    if(x == '+')
    {
        t_fptr = goo_ptr(op1, op2, a_fptr, s_fptr); // 1
        s_fptr=a_fptr;
    }else
    {
        goo_ptr=clever;
    }
    // goo_ptr -> foo clever | s_fptr -> minus plus
    t_fptr = goo_ptr(op1, op2, s_fptr, a_fptr); // 2
    t_fptr(op1, op2); // 3
    
    return 0;
}


// 24 : foo
// 31 : clever,foo
// 32 : plus
```

If we follow the traditional data flow approach, that is, we merge the pointer information at the PHI node, the callsite 3 will have 2 targets: "plus" and "minus". So the difference here is, **merging the data flow at the PHI node(as soon as possible) or at the function exit point(in the end)**.

So the intuitive solution is, **forking execution flow at every branch**. Yes, kind of like symbolic execution. 

By the way, if you know about some basic concepts of data flow analysis, the "*merge over paths*(MOP)" solution and the "*maximal fixed point*(MFP)" solution, **MOP is what we need**. Because the data flow analysis here is **not distribute**!

> For MOP & MFP, you can visit [here]( https://pascal-group.bitbucket.io/lectures/DFA-FD.pdf ) .

For`test19.c` , you can check whether the condition is constant(always true or always false) at every branch instruction. It's called *non-forking* in symbolic execution.

### Implementation for MFP

here I will talk a little about my implementation of the "forking" mechanism. At first, we need a ***state*** abstraction. The first version of mine seems like below:

```c
struct State {
  map<const Value *, FuncPtrSet> funcPtrMap; // environment
  const Instruction * PC; // branch Instruction pointer, as a "return address"
};
```

Things does not work well when we encounter some complex branches, the state above DO NOT track which branch(true or false) we chose before. So we should change to this:

```c
struct State {
  map<const Value *, FuncPtrSet> funcPtrMap; // environment
  const Instruction * PC; // branch Instruction pointer, as a "return address"
  stack<int> branchLabels; // branches we have taken
};
```

Why should we track the branches we already chose? Because the PHI node is far from the condition(branch instruction)... We will select only one incoming value in a PHI node if we want to implement MOP. So we need to track the true/false branch history we selected before, then we can make sure which incoming value we should take in a PHI node in a "path"(one execution). To represent branch history, here we use a stack which fits the forking(branch node) and merging(phi node) semantics.

<img src="1.png" alt="图呢..." style="zoom:50%;"/>