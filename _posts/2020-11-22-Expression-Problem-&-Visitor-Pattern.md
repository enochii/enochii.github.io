---
layout: mypost
title: Expression Problem & Visitor Pattern
categories: [Compiler, Design Pattern, Design]
---

## Expression Problem

### Introduction

Expression Problem 指的是你有 n 个类型和 m 个操作，所以会组成一个 n * m 的矩阵。如下图：

![matrix](./1.jpg)

这里举的例子是对于各种 AST Node 类型，我们会进行不同的操作，比如 interpret（求值）、pretty print（打印 human-readable 的 AST）等。叫做 "Expression Problem" 一开始也是因为在编译器设计中尝试对 AST 表达式建模而得名。

### Data vs. Operation

可以发现每一行对应一个类型（或者说对象），每一个列对应一个操作。那么我们如何组织代码呢？一般会有两种方式，按行或者按列。

### OOP(Object Oriented Programming)

对 OOP 如 Java 这样的语言，我们是按**对象**去组织代码的，也就是**按行**。做法是定义一个父类或者接口，子类包括 Binary 等去实现对应的 method 。

这样的好处在于，**加入一个新类型**很方便。我们直接加入一个新类，实现各种操作即可，原有的代码不需修改。那如果我想加一个新操作呢...... 那就意味着我要给包括父类（或接口） 和子类新添加一个方法，不是很优雅。

以上大体就是 OOP 切割需求和组织代码的方式。

### FP(Functional Programming)

到了 FP ，我们一般是按列去切分的。比如有一个 `interpret()` ，然后我们在其中做一个模式匹配(pattern matching) ，可以简单理解为对类型做一个 `switch case` 分发逻辑。

那在 Java 中，我们模拟这一套也很简单，比如：

```Java
ResultType interpret(Expr expr) {
    if(expr instanceof Binary) {
        ...;
    } else if(expr instanceof Unary) {
        ...;
    } ...
}
```

就这？一点也不优雅。

另外，采用按列切分的方式，加入新操作很简单，但新类型就很麻烦。**所以选择哪种切分方式，最终还是要回归到需求**。需求趋向于列变化还是行变化就会决定切分的方式。

在 Expression Problem 中，如果我们认为我们的节点类型已经基本确定，但新加入操作的可能性比较大，那明显应该按列切分。在 OOP 又该怎么优雅地完成呢？答案是 Vistor Pattern 。

## Visitor Pattern

### How

首先，要按列切分，我们要有一个表达单一操作的一个实体。它就是 Vistor ，我们可以定义这么一个接口：

```Java
// R means result type
interface Vistor<R> {
    R visitBinary(Binary b);
    R visitUnary(Unary u);
    R visitLiteral(Literal l);
}
```

在 Expression 也就是表达式这一头，我们会加入以下改动：

```Java
class Expr {
    abstract <R> R accept(Visitor<R> v);
}

class Binary {
    @Override
    <R> R accept(Visitor<R> v) {
     	v.visitBinary(this);
    }
    ...
}

class Unary {
    @Override
    <R> R accept(Visitor<R> v) {
     	v.visitUnary(this);
    }
    ...
}
... 
```

这里可以看到，表达式是不 care Visitor 的类型的，所以后续加入新的 Visitor 不会对这里产生影响。

接着，如果加入一个新操作，我们需要实现一个新的 Visitor ：

```Java
class InterpretVistor implements Visitor<> {
    @Override
    R visitBinary(Binary b) {
        ...
    }
    
    @Override
    R visitUnary(Unary u) {
        ...
    }
    
    @Override
    R visitLiteral(Literal l) {
        ...
    }
}
```

对于一个 `Expr` 的子类实例 `expr`，我们要执行 `interpret()` 操作，只需要：

```Java
InterpretVistor iv = new InterpretVistor(...);

expr.accept(iv);
```

这时候通过多态机制，`expr` 就会调用具体的子类实现的 `accept()` 。比如 `Binary` 就会调用 `visitBinary()` ，`Unary` 就调用 `visitUnary()` ...... 这其实就是帮我们做了一手**模式匹配**。

可以认为发生了这样的变换：

```shell
expr.accept(vistor) -> visitor.visitExpr(expr)
```

这样按列切割的方式的优缺点以及面对需求如何选择切割代码，前面已经提过了，此处不再赘述。

## Summary

本文简单介绍了 Expression Problem 和 Visitor Pattern，并指出如何根据需求去选择切分方式。有兴趣的话可以去看看[原文链接]( http://www.craftinginterpreters.com/representing-code.html#the-expression-problem )，本质上本文算是一个拙劣的翻译。

最后提一嘴，这里用拙劣英文做标题主要是为了简洁和不别扭...... 还有示例代码算是类 Java 的伪码，应该无法通过编译~

## Reference

 http://www.craftinginterpreters.com/representing-code.html#the-expression-problem 