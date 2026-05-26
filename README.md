# 微信小程序订阅消息模板批量工具

这个项目用于把一个源小程序已有的订阅消息模板导出成配置，再批量添加到多个目标小程序。

## 1. 准备源小程序配置

复制示例配置：

```cmd
copy .env.example .env
```

编辑 `.env`：

```text
WECHAT_APPID=源小程序 appid
WECHAT_SECRET=源小程序 secret
```

如果你已经有可用的 `access_token`，也可以改用：

```text
WECHAT_ACCESS_TOKEN=源小程序 access_token
```

## 2. 导出源小程序模板

```cmd
npm run export:templates
```

默认输出到：

```text
exports/templates-*.json
```

导出结果里的关键字段：

```json
{
  "title": "满意度调查提醒",
  "type": 2,
  "typeName": "一次性订阅",
  "priTmplId": "源小程序自己的模板 ID",
  "publicTid": 1234,
  "kidList": [1, 2],
  "sceneDesc": "满意度调查提醒服务场景",
  "fields": [
    {
      "index": 1,
      "name": "项目名称",
      "valueKey": "thing1.DATA",
      "kid": 1,
      "example": "门诊药流"
    }
  ]
}
```

说明：

- `priTmplId` 只能用于源小程序，不能复制给其他小程序。
- `publicTid + kidList + sceneDesc` 是批量添加到其他小程序时真正需要的配置。

## 3. 准备目标小程序列表

复制示例文件：

```cmd
copy targets.example.json targets.json
```

编辑 `targets.json`：

```json
[
  {
    "name": "project-a",
    "appid": "目标小程序 appid",
    "secret": "目标小程序 secret"
  }
]
```

也可以使用已有 token：

```json
[
  {
    "name": "project-a",
    "appid": "目标小程序 appid",
    "accessToken": "目标小程序 access_token"
  }
]
```

## 4. 先 dry-run 检查

把 `--templates` 换成第 2 步导出的最新文件：

```cmd
npm run add:templates -- --templates exports\templates-xxx.json --targets targets.json --dry-run
```

`--dry-run` 不会调用微信的 `addtemplate` 接口，因此不会真正创建模板。它仍然会访问微信接口来获取目标小程序的 `access_token` 和现有模板列表，用于判断哪些模板已存在、哪些模板将会被添加。

## 5. 正式批量添加

确认 dry-run 结果无误后执行：

```cmd
npm run add:templates -- --templates exports\templates-xxx.json --targets targets.json
```

执行后会输出：

```text
exports/add-template-results-*.json
```

结果里会记录每个目标小程序对应的新模板 ID：

```json
{
  "appid": "wx_target_appid",
  "templates": [
    {
      "title": "满意度调查提醒",
      "action": "added",
      "priTmplId": "目标小程序自己的模板 ID",
      "publicTid": 1234,
      "kidList": [1, 2]
    }
  ]
}
```

`action` 含义：

- `added`：已新建模板。
- `skipped_existing`：目标小程序已经有同标题、同字段顺序的模板，脚本跳过并记录现有 `priTmplId`。
- `would_add`：dry-run 模式下将会添加。

## 密钥安全注意事项

- `.env` 和 `targets.json` 会包含真实 `secret` 或 `access_token`，不要提交到 Git。
- 项目已通过 `.gitignore` 忽略 `.env`、`targets.json` 和导出的 JSON 结果。
- 只提交 `.env.example` 和 `targets.example.json` 这类占位示例。
- 如果真实密钥已经被提交或外泄，请立即到微信公众平台轮换密钥。
