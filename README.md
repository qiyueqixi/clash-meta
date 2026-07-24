有BUG自己拿源码修一下把,我不管其他的

# fnOS Clash.Meta 原生应用包

这是飞牛 fnOS 可直接安装的 Clash.Meta / mihomo 原生 Native 应用，不是 Docker 包。

- 应用版本: `1.19.27-31`
- mihomo: `v1.19.27`
- Web 面板: `MetaCubeXD v1.258.3`
- 架构: x86_64 compatible、ARM64
- 入口: fnOS 统一网关 `/app/clash-meta/ui/`
- 默认代理端口: `7899`
- DNS 端口: `1053`

## 主要能力

- mihomo、MetaCubeXD、geodata 全部内置，启动不依赖 GitHub 下载。
- 使用 fnOS 专用应用用户运行，不使用 root，不依赖 Docker。
- 桌面和应用中心“打开”按钮使用 fnOS 统一网关，支持 HTTP、WebSocket 和 fnOS 登录校验。
- mihomo 控制器只监听 `127.0.0.1:9090`，不再直接暴露给局域网。
- 安装向导支持普通订阅、`clash://install-config` 和完整 YAML URL。
- 应用设置页可以重新替换订阅或完整 YAML；留空表示不修改。
- 内嵌页右下角“配置”会原子写入 `config.yaml` 并热加载，重启后不会丢失；失败自动恢复旧配置。
- 新生成的订阅配置默认使用“自动选择”延迟测试组，同时保留手动节点和 `DIRECT`。
- 配置、provider、secret 和日志保存在飞牛“应用文件”目录。
- 卸载可选择保留全部、保留配置与订阅、删除全部数据。

## 构建产物

产物位于 [dist](D:/clash-meta/dist)：

- `clash.meta_1.19.27-31_x86.fpk`
- `clash.meta_1.19.27-31_arm.fpk`
- `SHA256SUMS.txt`

构建：

```powershell
python scripts/build-fpk.py
```

打包器会检查 fnOS 入口、权限、资源、向导、生命周期脚本、geodata、Web 配置、平台二进制和 Linux 执行位。

## 使用

安装时两个地址框二选一：

- 大多数用户填写“订阅 / 导入链接”。
- 只有链接内容本身就是完整 mihomo YAML 时，才填写“完整 YAML 配置 URL”。
- 两个都留空会使用最小默认配置。

安装后从桌面图标或应用中心“打开”进入。不要再手工填写 `http://飞牛IP:9090`；`9090` 从此版本开始只供 NAS 本机网关代理使用。

配置和日志：

```text
<应用文件>/clash.meta/config/config.yaml
<应用文件>/clash.meta/config/config.yaml.bak
<应用文件>/clash.meta/config/config.yaml.settings-backup
<应用文件>/clash.meta/config/secret
<应用文件>/clash.meta/config/providers/
<应用文件>/clash.meta/logs/mihomo.log
```

更完整的安装说明见 [INSTALL.md](D:/clash-meta/INSTALL.md)，维护和踩坑记录见 [MAINTENANCE.md](D:/clash-meta/MAINTENANCE.md)。
