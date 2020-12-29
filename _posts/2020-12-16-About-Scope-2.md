---
layout: mypost
title: 关于 scope [下集]
categories: [Compiler]
---

上篇文章 [关于 scope]( https://enochii.github.io/posts/2020/12/14/About-Scope.html ) 结尾的时候，留了个坑。说支持支持闭包的静态作用域（无语病）不是很难，然而事实证明是我 naive 了，还是需要花点功夫的。

这里先给出我原来的想法，然后指出哪里错了，最后给出正确的实现思路。

## 错误的思路

我原来的想法是把函数定义和函数定义点的 environment 进行绑定，看起来像这样：

<img src="1.jpg" alt="image" style="zoom:50%;"/>

问题其实和我们 scope 的表示有点关系，考虑如下代码：

```javascript
var a = "global";
{
    fun f() {
        println a;
    }
    f(); // global
    var a = "local";
    f(); // local
}
```

我们预期的结果是两个 `f()` 的调用都打印 "global" ，然而事与愿违。以下分别为两次调用时对应的 environment chain ：

<img src="2.jpg" alt="image" style="zoom:50%;"/>

第二次 `f()` 调用对名字 `a` 的解析，在经过 Block Environment 时就已经被截获了，这就是万恶之源。

问题出在我们希望函数定义绑定的是一个定义点环境的 **snapshot**（快照），而我们的 Environment 代表的是一个**运行时的 scope**，在新定义一个变量后就会被篡改。也就是说，对 `f()` 的多次调用看到的 Environment 可能是不一样的。

## 正确的思路

解决这个问题一般有两个思路：

- 出现一个新变量定义就创建一个新的 Environment
- 利用词法地址在运行前将名字 resolve（解析）到对应的 environment

### 思路一：一个定义一个 Environment

现在我们的 `Environment` 类定义大概长这样：

```java
class Environment {
    Map<String, Object> bindings; // bindings in this scope
    Environment enclosing; // outside environment
    ...
}
```

这种做法一个 Environment 实例会对应一个 scope （或者一对大括号），在对应大括号内新发生一个定义后，这个 Environment 的 `bindings` 就会发生改变。

思路一是把这种粗粒度的 Environment 拆分成多个小的环境，也就是我们说的一个定义会创建一个 Environment ，据此我们可以有：

```java
class Environment {
    Pair<String, Object> bindings; // the only binding in this environment
    Environment enclosing; // outside environment
    ...
}
```

对于下列代码

```java
{
    // [1]
    var a = "a";
    // [2]
    var b = "b";
    // [3]
    var c = "c";
    // [4]
}
```

忽略 block 的外层环境，对于 4 个点，我们的 Environment 分别如下：

<img src="3.jpg" alt="image" style="zoom:50%;"/>

简单来说，[1] 处看不到任何 binding，[2] 可以看到 `a` ，[3] 可以看到 `a` `b`，[4] 可以看到 `a` `b` `c`。

这就完成了我们想要的『快照』。如果你写过 Lisp 或它的方言，你应该会发现它的链表表达这个逻辑简直是浑然天成。在定义一个新名字时，我们可以：

```scheme
(define new-env (cons <new-binding> old-env)
```

对于快照，我们只要 hold `old-env` 这个指针，后续定义新的环境会创建新的链表，`old-env` 不会受到影响。在退出一个 scope 时，reset 环境指针就好了！

### 思路二：词法地址

思路二是使用词法地址，我们很容易有这样的想法：既然作用域是静态的，那么为什么不在运行前就把 use-definition relation（指名字的使用和定义）确定下来呢？即对于程序中出现的每一个对变量的使用，我们都可以找到声明（定义）它的 scope。

据此，我们可以在运行前，将名字的使用 resolve 到某一个特定的 Environment 。这样一来在运行时直接到这个 Environment 搜索该名字即可。

词法地址除了解决 scope 的问题，还优化了名字的查找。在名字查找时，我们不用沿着 environment chain 从里到外屁颠跑一整躺了。

具体的实现可以在 parsing 后对语法树再做一次**语义分析**，具体可以参考[这里]( http://www.craftinginterpreters.com/resolving-and-binding.html )，或者后续有时间我补一篇......

另外，如果 `Environment` 类的 `bindings` 是 `Array` 而不是 `Map` ，我们可以一步到位，这样词法地址就是一个 pair ，它由两部分组成：

- 一个 Environment ，它代表变量定义指向的 scope
- 一个 Integer ，它代表该变量定义在 `Environment.bindings` 数组的下标

## 总结

本文把上篇博客留下的关于静态作用域的坑补上了，简单介绍了玩具解释器中静态作用域的两种实现方式。跑步去啦！go go go！
