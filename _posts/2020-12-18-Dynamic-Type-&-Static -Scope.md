---
layout: mypost
title: 动态类型语言和静态作用域
categories: [Compiler]
---

又做了一回标题党...... 这篇文章基于[这个 tutorial]( http://www.craftinginterpreters.com/classes.html#properties-on-instances ) ，蛮不错的一本书，手把手教你写一个静态作用域的动态类型语言解释器。本文会更像一篇笔记，简单聊聊在实现这个玩具语言时，关于类相关作用域的一点思考。

## field vs. variable

对于 class instance 的 field 获取，tutorial 在实现上，是和一般变量的获取有差异的。

前者（指 *读写 field*）通过在每个 instance 安插一个 `fields` （其实是一个 map），然后捕获 get/set 事件，对 map 进行读取和修改；后者（指 *读写 variable*）就是通过嵌套的 scope ，通过 `Environment` 去读写变量。

对于 `this` ，tutorial 则是在 `instance.method()` 的 `instance.method` 返回前 bind 一个 this 变量，这就变成了 *bound method*。这样一来类内的方法就可以访问 `this` 变量，也可以通过这个句柄来访问属于这个类实例的 field 和 method （指 `this.field` / `this.method` ）。

## 我想干的事...

现在问题来了，我不希望在 method 中获取 `field` 都要用 `this.field` ，我想直接 `field` 就完事。

```javascript
class A {
	f() {
        this.field = 1;
        
		// i hate this
        println this.field;
        // instead, i like this
        println field;
    }    
}
```

这里有一个前提是语言的作用域是静态的，我们会通过词法解析在运行前确定变量的作用域。之前由于有 `this.` 在 `field` 前面，所以在词法地址解析的时候是不会 care `field` 的（也就是只会解析 `this` 的词法地址）。那如果你想单写一个 `field` ，意味着你认为 `field` 是在编译时就能确定它的定义位置也就是词法地址。所以语义分析 resolve 也好，解释运行时查找都会走 scope 这条路。

## 错误示范

我拍脑袋一想，给每个 instance 都弄一个环境，在 setter 时顺便把 field 扔进去，另外把 this 也放进去，不就成了？

![alt](1.jpg)

不成......

其实问题出在我们在定义完 class 可以给 instance 增加新 field ，这又回到了动静态 scope 的问题。先扔个例子：

```javascript
var str = "global";
class A{
    f() {
        println str;
    }
}

var a = A();
a.str = "instance field";
```

从我们一开始不想写 `this.str` 出发，我认为用户更倾向打印的 `str` 是 `"instance field"` 。然而根据词法作用域，打印的应该是 `"global"` 。本质上这是因为，我们的玩具动态语言的类作用域是动态的（可以简单理解为在给一个类定义之后，我们可以给类实例疯狂添加 field）。所以在 method 内获取 field 时，我们会通过 `this.field` 来绕过词法地址解析 `field` ，这样就会走 getter / setter 的路，类实例其实就是一个 map 了。

## 其他语言

以前对于 Python 为啥一定要 `self.*` 有点不解，现在想想也是和这个稍微有点关系。虽然 Python 是万恶的 dynamic scope（噫！

形如 C++/Java 这样更*静态*的语言（感觉这里说静态类型语言又不是很合适），类可以拥有的 field 在编译时已经定了下来。这意味着每个类实例的所有 field 在运行前已经确定了类型，所以我们认为类相关的 scope 是非常 static 的。因此我们在运行前就可以确定词法地址了，故我们没必要用 `this->field` or `this.field` 这样丑陋的写法。
