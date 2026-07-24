# Clash.Meta for fnOS

飞牛 fnOS 原生 Native 应用包，不使用 Docker。

- Core: mihomo v1.19.27
- Dashboard: MetaCubeXD v1.258.3
- Package: 1.19.27-31
- fnOS gateway: `/app/clash-meta/ui/`
- Proxy port: `7899`
- Local-only controller: `127.0.0.1:9090`

安装向导和应用设置页均提供“订阅 / 导入链接”和“完整 YAML 配置 URL”两个输入框，二选一填写；`clash://install-config?url=...` 填订阅框。新生成的订阅配置每天自动更新 provider，并默认通过“自动选择”延迟测试组选择节点。

内嵌页右下角“配置”按钮会把生成的配置原子写入应用文件中的 `config.yaml`，备份旧配置后调用 mihomo 热加载。只有 fnOS 管理员通过统一网关访问时才能调用该写入接口。

用户配置位于飞牛“应用文件”的 `config/config.yaml`，日志位于 `logs/mihomo.log`。包内已包含 `country.mmdb`、`geoip.metadb`、`geoip.dat` 和 `geosite.dat`，用户设备不需要从 GitHub 下载 geodata。
