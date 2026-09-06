## 什么时候用 Mock

只在**系统边界**用 Mock：

- 外部接口（支付、邮件等模块）
- 数据库（有时，优先使用测试数据库）
- 时间和随机性
- 文件系统（有时需要）

不要 Mock：

- 你自己的类/模块
- 内部协作对象
- 你自己能掌控的代码

## 怎么让代码容易 Mock

在系统边界处，把接口设计成容易 Mock 的样子：

**1. 使用依赖注入（Dependency Injection）**

把外部依赖传进来，而不是在内部自己创建。这样测试时可以替换依赖：

```typescript
// 容易 Mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// 难以 Mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. 优先使用SDK风格的接口，而非通用拉取器（Fetcher）**

每个外部操作单独写一个函数，而不是只写一个通用函数加一堆条件判断：

```typescript
// 好: 每个函数都可以独立 Mock
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// 坏: Mock 的时候还得在 Mock 内部做条件判断
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

SDK 这种做法的好处：

- 每个 Mock 只返回一种固定结构
- 测试代码里不用写条件判断
- 一眼就能看出某个测试用例调用了哪个端点
- 每个端点都有类型保证
