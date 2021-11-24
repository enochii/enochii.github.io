---
layout: mypost
title: Simple Control Flow Analysis of C in the presence of function pointer
categories: [Program Analysis]
---

---

It's the assignment 3 of UCAS compiler course, we need to implement a flow sensitive, context and field-insensitive *Control Flow Analysis*. We will find all target callees of each callsite, after that we can build a interprocedural call graph.

For simplicity, the test cases have no recursion. 

### Basic Idea

To get a whole program fixed point, an intuitive approach is, use **2 kinds of worklist**. One is function worklist, all functions waited to be processed are placed here. The other one is Basic Block worklist for each function. we can think the latter as the fixed point calculation of a function unit (intraprocedurally).

These 2 worklists will communicate through call and return, usually we will start from entry method(e.g., `main` method). 

### Key Points

#### Add a function to worklist

Adding a function to global function worklist means that a function needed to be processed. a function needed to be (re)processed when its input changes. There are 2 cases:

- when we encounter a call statement, if the caller gives more information to callee via parameter passing,  we will add the callee into worklist. 
- when a callee return, it may change the information of return sites of its callers, at this case we will re-process all the callers.

#### Map & Unmap data flow(pointer information)

"map" and "unmap" are taken from [1]. In my opinion, "map" means passing data flow carried with parameter and global variable, "unmap" means the inverse operation together with returning the information of "return statement". Usually, when we map from caller to callee, we will kill the data flow we mapped. And in unmap stage, we merge them back. If we do not kill the mapped data flow, the precision may get hurt.

#### When to invalidate state?

As we know, for a store statement `*x = y`, we have the below transfer function:

- S = S/{v -> S(v)} ∪ {v -> S(y)}, if S(x) = {v} // strong update
- S = S ∪ {v0 →S(y)} …∪ {vn →S(y)}, if S(x)={v0…vn} // weak update
- S = Top, if S(x) is empty

"Top" here is a **empty map**. That's to say, in the last case, we will **invalidate the state(IN/OUT) of the store statement**. Though a little surprising, it is mainly for the **monotonicity** of transfer function.

There are also 2 other similar cases which may be ignored.

The first case is **call via a function pointer whose points-to set is currently empty**. This one is easy to understand —— when we call via a pointer which points to nothing, it maybe points to everything.

The second case is, when we call a function which has never been called, we need to **invalidate the state of current call instruction, and abort the processing of current function(i.e., caller)**. For example, when we process a function named `F`, and `F` call function `G` at callsite *c*. If `G` has never been called, we will clear callsite *c* 's points-to relation(its state), and abort the processing of `F`. Then we will process `G`, after which we process `F` again.  Why? That's because `G` may have side effect(which is often the case). For instance, this invocation of `G` strong updates some pointers of `F` which are passed to `G` as arguments. For precision we need to consider this and process `F` later.

They are all for **monotonicity**. And for the latter case, if it's NOT **the first time we call this callee**, we can continue with making the output as **the old return information**(DO NOT just escape the transfer function of this callsite and take the *IN* as the *OUT* state). Because we give the callee more information this time, the output **will not shrink**. Take the old return-information will not hurt monotonicity.

### The end

My implementation has some flaws. It does not handle recursion, even strong updates the heap pointer, which is not sound for a naive heap abstraction[2]. Actually, to pass all the test cases, it seems that we have to strong update all the time even when the points-to set is larger than 1... Dube, that's really not cool...

Recursion could be handled if we follow the above approach. My current implementation will abort caller function processing when input of callee's entry node changes rather than just when the callee is processed for the first time. Also, remember to kill the mapped data flow and, merge them back at unmapping stage even the points-to set of mapped part DOES NOT changes, which is the same thing we are supposed to do when the mapped part changes.

Ok, that's all I want to say, if you find the description is wrong or ambiguous, I would appreciate if you give me some advice!

### Reference

[1] Context-Sensitive Interprocedural Points-to Analysis in the Presence of Function Pointers 

[2] Flow-Sensitive Pointer Analysis for Millions of Lines of Code
