---
layout: mypost
title: "Homework: Threads and Locking"
categories: [6.828]
---

一个很简单的多线程哈希表实现，让我们在对应的位置加上 lock 和 unlock 。

### 同步粒度

首先大方向上，可以选择 coarse-graind 的 Big lock ，或者 fine-grained 的 lock per key 。我们采用后者，需要声明一个 `locks[NBUCKETS]` 数组并在 main 中初始化：

```c
// global declared
pthread_mutex_t locks[NBUCKET];

// in main()
for (i = 0; i < NBUCKET; i++) {
    pthread_mutex_init(&locks[i], NULL);
}
```

### 并发写

主要得解决并发写的问题：

```c
static void 
insert(int key, int value, struct entry **p, struct entry *n)
{
  struct entry *e = malloc(sizeof(struct entry));
  e->key = key;
  e->value = value;
  // [2] lock
  e->next = n;
  // [2] unlock
  *p = e;
}

static 
void put(int key, int value)
{
  int i = key % NBUCKET;
  // [1] lock
  insert(key, value, &table[i], table[i]);
  // [1] unlock
}
```

最简单有效的 solution 就是在 [1] 处分别加上 lock 和 unlock ，但注意到在 insert 中我们创建并初始化了一个 entry ，这部分明显也是可以并发的。

但如果我们在 [2] 处直接加，也是会有问题的！考虑两个对同一个 key 的写，它们同时到达了 [2] lock ，它们持有相同的 n ，此时临界区 [2] 的先后执行后：

```shell
e1 -> n
e2 -> n
```

这样一来，我们会丢失一个 entry ，这个 entry 为先写的那个 entry 。

期望的结果是：

```shell
e1 -> e2 -> n or
e2 -> e1 -> n
```

所以正确且高效的解法应当是：

```c
static void 
insert(int key, int value, struct entry **p, struct entry *n)
{
  struct entry *e = malloc(sizeof(struct entry));
  e->key = key;
  e->value = value;
  pthread_mutex_lock(&locks[key%NBUCKET]);
  e->next = *p; // do not use n(temp variable)!
  *p = e;
  pthread_mutex_unlock(&locks[key%NBUCKET]);
}

static 
void put(int key, int value)
{
  int i = key % NBUCKET;
  insert(key, value, &table[i], table[i]);
}
```

### 测试

```shell
sch001@XiaoxinOfSCH:~/os/lock$ ./a.out 2
1: put time = 0.005941
0: put time = 0.006047
0: get time = 6.757431
0: 0 keys missing
1: get time = 6.767826
1: 0 keys missing
completion time = 6.774175
sch001@XiaoxinOfSCH:~/os/lock$ ./a.out 1
0: put time = 0.009482
0: get time = 7.278956
0: 0 keys missing
completion time = 7.288779
sch001@XiaoxinOfSCH:~/os/lock$ ./a.out 3
a.out: ph.c:123: main: Assertion `NKEYS % nthread == 0' failed.
Aborted (core dumped)
sch001@XiaoxinOfSCH:~/os/lock$ ./a.out 4
0: put time = 0.008097
2: put time = 0.008229
3: put time = 0.008366
1: put time = 0.008537
1: get time = 6.703571
1: 0 keys missing
0: get time = 6.715403
0: 0 keys missing
2: get time = 6.718760
2: 0 keys missing
3: get time = 6.732709
3: 0 keys missing
completion time = 6.741610
sch001@XiaoxinOfSCH:~/os/lock$ 
```

其实写加上了同步并不会很耗时，因为我们每次都在表头写；而读可能需要遍历链条，这取决于哈希算法，我们只有 5 个 bucket 所以冲突会很多，读耗时也在情理之中。