---
layout: mypost
title: 关于 scope
categories: [Compiler]
---

本文会简单聊一聊在写玩具解释器（or 编译器）中 scope 的实现及一些小细节。首先简单过一下 scope 的基本概念。

## Scope

[Wikipedia]( https://en.wikipedia.org/wiki/Variable_(Programmierung)#Sichtbarkeitsbereich_von_Variablen_(Scope) ) 这样定义 scope ：

> In [computer programming](https://en.wikipedia.org/wiki/Computer_programming), the **scope** of a [name binding](https://en.wikipedia.org/wiki/Name_binding)—an association of a name to an entity, such as a [variable](https://en.wikipedia.org/wiki/Variable_(programming))—is the part of a [program](https://en.wikipedia.org/wiki/Computer_program) where the name binding is valid, that is where the name can be used to refer to the entity. In other parts of the program the name may refer to a different entity (it may have a different binding), or to nothing at all (it may be unbound).

简单来说，scope 决定了当你手头有一个名字，你怎么找到它的定义，从而获取它当前的值、静态类型（如果有）等信息。

## Static vs. Dynamic

scope 大致有两种，分别是 static(lexical) scope 和 dynamic scope 。

>Wikipedia again
>
>In languages with **lexical scope** (also called **static scope**), name resolution depends on the location in the source code and the *lexical context* (also called *static context*), which is defined by where the named variable or function is defined. In contrast, in languages with **dynamic scope** the name resolution depends upon the [program state](https://en.wikipedia.org/wiki/Program_state) when the name is encountered which is determined by the *execution context* (also called *runtime context*, *calling context* or *dynamic context*).  

static scope 指你在运行代码前就可以判断 use-define set ，dynamic scope 则会依赖程序的执行流是怎么走的。

## Scope 在玩具解释器中的实现细节

如果看完前两节你还不理解 static/dynamic scope，那么建议你先找点补充资料；确实我不打算花太多时间讲概念，所以说的很笼统~

~~正文开始。~~ 写玩具解释器的时候，碰到了一个有趣的问题。首先 interpreter 是有『状态』的，比如全局环境和当前环境（环境指的是 “名字->值的绑定”）。

```java
public class Interpreter {
    // variables bindings
    final Environment globals_ = new Environment();
    private Environment env_ = globals_;
    ...
}
```

这里 `Environment` 是自定义的类：

```java
public class Environment {
    private Map<String, Object> bindings_ = new HashMap<>();
    final Environment enclosing_;

    Environment() {
        this.enclosing_ = null;
    }
    Environment(Environment enclosing) {
        this.enclosing_ = enclosing;
    }
    // more operations here...
}
```

从 `Environment enclosing_` 可以看出我们的环境是可嵌套的，比如说在 C++ 中，大括号一般就会建立一个新的 block ，新 block 中的名字会覆盖外层的名字。外层环境就是这里的 `enclosing_` 。

当我们执行函数调用时，我们需要给函数体的执行指定一个 `enclosing environment`。比如我们可以给 `interpreter.globals_` ：

```java
// user defined function wrapper
public class LoxFunction implements LoxCallable {
    private Stmt.FuncDecl function;
    LoxFunction(Stmt.FuncDecl FuncDecl) {
        this.function = FuncDecl;
    }

    @Override
    public Object call(Interpreter interpreter, List<Object> args) {
        // give function body a enclosing env
        Environment funcEnv = new Environment(interpreter.globals_);

        for(int i=0; i<args.size(); i++) {
            funcEnv.define(
                    function.parameters.get(i),
                    args.get(i)
            );
        }
        // excute the body code with the new funcEnv
        interpreter.executeBlock(function.body, funcEnv);
        return null;
    }
```

这样一来，函数的外层环境就是 global environment 。也就是说，除了形参和局部变量，我们**只能**看到全局的 binding 。

比如给定如下代码，我们的输出会如注释所示：

```java
var a = "global a";
{
    var a = "local a";
    fun f() {
        println a; // global a
    }
    f();
    println a; // local a
}
```

那么如果我们想支持闭包或者说嵌套函数呢？也就是说，我们希望两个都打印 "local a" ！

那是不是我们改成 `interpreter.env_` 即当前环境就万事顺心了呢？也就是：

```java
public Object call(Interpreter interpreter, List<Object> args) {
        // give function body a enclosing env
        Environment funcEnv = new Environment(interpreter.env_);
    	...
}
```

好像是的，我们会得到下列输出：

```shell
local a
local a
```

又好像不是，比如这样：

```javascript
var a = "global a";
{
    var a = "local a";
    // [1]
    fun f() {
        println a; // local a
    }
    f();
    println a; // local a

    {
        var a = "local a-2";
        f(); // "local a-2"
    }
}
```

因为我们是在函数调用时获取 `interpreter.env_` 的引用，所以 `env_` 的变化（比如进入新 block 指向新的 Environment）对于我们而言是可见的。

其实从 `global_` 到 `env_` ，我们得到了两种 scope ，一种是没有闭包的 static scope ，另一种是 dynamic scope 。

如果我们想要有闭包支持的 static scope 呢，即对于函数 f 而言，看到的变量定义一定是 `var a = "local a";` 。这个也比较之简单，只要**让函数定义的 enclosing environment 和定义点即 [1] 处的 `env_` 进行强绑定就行**，而不是在每次函数调用时再给函数体一个 enclosing environment 。这里就懒得给出具体代码实现了...... 

## 总结

本文简单介绍了 scope 及 scope 在玩具解释器中的实现细节，代码可参考[这里]( http://www.craftinginterpreters.com/functions.html ) 及[对应的仓库]( https://github.com/munificent/craftinginterpreters )。限于笔者水平，如有疏漏或错误恳请读者指出。