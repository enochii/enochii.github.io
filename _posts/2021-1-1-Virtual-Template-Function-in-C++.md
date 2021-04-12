---
layout: mypost
title: “Virtual Template Function” in C++
categories: [Design, C++]
---

> **免责声明**
>
> 限于个人水平及 C++ 之博大精深，若本文存在错误或疏漏恳请读者指出，感谢~

## Requirement

问题是这样的，在写一个支持简单运算的 *Parser* ，所以需要各种表达式。比如说我们有 `Binary` （二元表达式）、 `Unary` （单元表达式）和 `Literal` （数字常量），一般而言我们会抽出一个基类 `Expr` ，所以我们可以有如下的结构：

![expr](expr.jpg)

其实表达式就是我们平时说的 *AST* 。接着我们需要为每种表达式提供某种操作，比如 *evaluate* （求值），*pretty-printing* （按某种格式打印 *AST*）。[这篇文章]( https://enochii.github.io/posts/2020/11/22/Expression-Problem-&-Visitor-Pattern.html )提到有两种手法来提供操作，一种是 *OO* 的做法，就是在继承体系中给每一个节点都添加一个方法（比如 `eval()`），另一种是用 *Visitor Pattern*（访问者模式），本文会采用后者。

一般而言，我们的 `Visitor` 是参数化的，即

```c++
template<class T>
class Visitor {
public:
    virtual T visitBinary(ObjectA &a) = 0;
    virtual T visitUnary(ObjectB &b) = 0;
    // ... other expressions
};

// pretty printing
class ASTPrinter :public Visitor<std::string> {
    virtual T visitBinary(ObjectA &a) {
        ...
    }
    virtual T visitUnary(ObjectB &b) {
        ...
    }
}
```

对应的，我们的 `Expr` 相关的代码为：

```c++
struct Expr {
    template<class T>
    T accept(Visitor<T> &visitor);
};

struct Binary {
    template<class T>
    T accept(Visitor<T> &v) {
        return v.visitBinary(*this);
    }
};

struct Unary {
    template<class T>
    T accept(Visitor<T> &v) {
        return v.visitUnary(*this);
    }
}
```

不对，大 C++ 虚函数是需要显示地写 `virtual` 关键字的，所以变成：

```c++
struct Expr {
    template<class T>
    virtual T accept(Visitor<T> &visitor) = 0; // problem here
};

struct Binary {
    template<class T>
    T accept(Visitor<T> &v) override {
        return v.visitBinary(*this);
    }
};

struct Unary {
    template<class T>
    T accept(Visitor<T> &v) override {
        return v.visitUnary(*this);
    }
}
```

但上面的代码是编译不过的，因为 C++不支持 *templated virtual function* （虚模板函数），[这个 SO 问题]( https://stackoverflow.com/questions/2354210/can-a-class-member-function-template-be-virtual )已经做了讨论，可供参考。我觉得考虑一些实现细节可能会更好理解，**一般** C++ 是通过 *vtble* 去实现 *virtual function* 和对应的 *dynamic dispatch* ， *vtable* 是固定大小的，然而一个类的 *templated virtual function* 个数是不定的（你给不同的参数，编译器就帮你实例化出来具化的函数），这造成了冲突。可以参考[这个回答](https://stackoverflow.com/a/27709454/10701129) 。

此路不通？大约有两种方式解决。

## Option 1: Separate Visitor Interface（不推荐，建议跳过）

参考了另一个 [SO 回答](https://stackoverflow.com/questions/2939860/need-a-virtual-template-member-workaround )：

```c++
#include <string>
#include <iostream>
using std::cout;
using std::endl;

struct ObjectA;
struct ObjectB;
class VisitorInternal {
    public:
    virtual void visitA(ObjectA &a, bool first=true) = 0;
    virtual void visitB(ObjectB &b, bool first=true) = 0;
};

struct Object {
    virtual void accept(VisitorInternal& v, bool first=true)=0;
};
struct ObjectA :public Object{
    int a = 1211;
    Object* child;

    void accept(VisitorInternal& v, bool first=true) override
    {
        v.visitA(*this, first);
    }
};
struct ObjectB :public Object{
    int b = 1112;

    void accept(VisitorInternal& v, bool first=true) override
    {
        v.visitB(*this, first);
    }
};

template <class Res>
class Visitor :public VisitorInternal{
public:
    virtual void visitA(ObjectA &a, bool first=true) = 0;
    virtual void visitB(ObjectB &b, bool first=true) = 0;

    virtual Res getRes() = 0;
};

class Visitor1 :public Visitor<std::string>
{
    std::string res_;
public:
    void visitA(ObjectA& a, bool first=true)override
    {
        auto str = "A(a=" + std::to_string(a.a) +")";
        res_ = first? str:res_+str;
        if(a.child != nullptr) {
            res_ += "(";
            a.child->accept(*this, false);
            res_ += ")";
        }
    }
    void visitB(ObjectB& b, bool first=true)override
    {
        auto str = "B(b=" + std::to_string(b.b) +")";
        res_ = first? str:res_+str;
    }
    std::string getRes() override 
    {
        return res_;
    }
};
int main()
{
    Visitor1 visitor1;
    ObjectA a;
    ObjectB b;
    a.child = &b;
	// usage
    a.accept(visitor1);
    cout << visitor1.getRes() << endl;    
    b.accept(visitor1);
    cout << visitor1.getRes() << endl;

    return 0;
}
```

这里多提供了一个 `Visitor.getRes()` 方法，然后用一个 *data member* `res_` 去缓存中间结果。另外，为了区分一个 `accept()` 或者说 `visit*()` 方法是由用户直接还是间接调用，我们多了一个默认参数 `bool first` ，这个看代码应该很好理解。

这种 workaround 除了不优雅之外，另一个问题是 `res_` 是被多次调用共享的，所以在一些情况下比如并发就有问题了。然而至少可以勉强解决我的问题 （：

## Option 2: Type Erasure（推荐）

第二种办法，换 Java 写...... Java 的泛型的实现是基于 *Type Erasure* （类型擦除）。简单来说，C++ 在编译时会根据模板使用点进行模板实例化，所以会有多份代码；而 Java 只有一份代码，万物皆  Object 。

所以我们可以在库层面模拟 Java 的类型擦除，在 C++ 中自然就是 `void*` 了？其实 boost 有提供强如 `Any` 的东东，根据我自己的需求我也造了一个[小（~~破~~）轮子]( https://github.com/enochii/Tiny-Pratt-Parser/blob/main/any.h)，只能说 `shapred_ptr<void>` 👍👍。

## Summary

本文简单探索了如何去简陋地模拟 C++ 的虚模板函数，并给出了对应的实现。因为笔者对 C++ 了解较少，如有错误或疏漏望读者可通过 issue 或邮件至 chenghangshi@gmail.com 指出~