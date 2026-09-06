## 好测试

**集成式测试(Integration-style)**：通过真实的接口进行测试，而不是通过模拟内部组件。

```typescript
// 好测试: 测的是可观察的行为
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

**特征：**

- 测试的是用户/调用者关心的行为
- 仅使用公共 API
- 内部重构不影响它
- 描述的是“做什么”（WHAT）而不是“怎么做”（HOW）
- 每个测试只验证一个逻辑点

## 坏测试

**实现细节测试(Implementation-detail tests)**：与内部结构耦合。

```typescript
// 坏测试: 测的是实现细节
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

**危险信号**：

- Mock 内部协作对象
- 测试了私有方法
- 断言调用次数或调用顺序
- 行为没变，一重构测试就挂
- 测试名称描述的是“怎么做”（HOW），而不是“做什么”（WHAT）
- 绕过接口，通过外部手段进行验证

```typescript
// 坏测试: 绕过接口去验证
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// 好测试: 通过接口验证
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**同义反复测试(Tautological tests)**：期望值本身就是按实现算出来的，所以这测试天生就能过。

```typescript
// 坏测试: 期望值的计算方式和代码一样
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// 好测试: 预期值是一个独立的已知字面量
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```
