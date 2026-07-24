(function () {
  const gatewayPrefix = "/app/clash-meta"
  const backendURL = `${window.location.origin}${gatewayPrefix}`
  const configImportDraftUrlKey = "clashMetaConfigDraftUrl"
  const legacySubscriptionPendingUrlKey = "clashMetaSubscriptionPendingUrl"
  const legacySubscriptionDraftUrlKey = "clashMetaSubscriptionDraftUrl"
  const runtimeConfigTimeoutMs = 30000
  const providerRefreshTimeoutMs = 8000
  const localEndpoint = {
    id: "local-mihomo",
    url: backendURL,
    secret: "",
    label: "Local mihomo",
  }

  window.__METACUBEXD_CONFIG__ = {
    defaultBackendURL: backendURL,
  }

  window.metacubexd = window.metacubexd || {}
  window.metacubexd.endpoint = {
    url: localEndpoint.url,
    secret: localEndpoint.secret,
  }

  try {
    const endpointListKey = "endpointList"
    const selectedEndpointKey = "selectedEndpoint"
    const rawList = window.localStorage.getItem(endpointListKey)
    let parsedList = []

    try {
      parsedList = rawList ? JSON.parse(rawList) : []
    } catch (_) {
      parsedList = []
    }

    const endpointList = Array.isArray(parsedList) ? parsedList : []
    const localIndex = endpointList.findIndex((item) => item && item.id === localEndpoint.id)

    if (localIndex >= 0) {
      endpointList[localIndex] = {
        ...endpointList[localIndex],
        ...localEndpoint,
      }
    } else {
      endpointList.unshift(localEndpoint)
    }

    const selectedEndpoint = window.localStorage.getItem(selectedEndpointKey) || ""
    const selectedItem = endpointList.find((item) => item && item.id === selectedEndpoint)
    let selectedUrlIsValid = false
    let selectedIsCurrentHost = false

    if (selectedItem && selectedItem.url) {
      try {
        const selectedURL = new URL(selectedItem.url)
        selectedUrlIsValid = true
        selectedIsCurrentHost = selectedURL.host === window.location.host
      } catch (_) {
        selectedUrlIsValid = false
        selectedIsCurrentHost = false
      }
    }

    window.localStorage.setItem(endpointListKey, JSON.stringify(endpointList))
    if (!selectedEndpoint || !selectedItem || !selectedUrlIsValid || selectedItem.id === localEndpoint.id || selectedIsCurrentHost) {
      window.localStorage.setItem(selectedEndpointKey, localEndpoint.id)
    }
  } catch (error) {
    console.warn("Failed to initialize local mihomo endpoint", error)
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key) || ""
    } catch (_) {
      return ""
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch (_) {}
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key)
    } catch (_) {}
  }

  function normalizeHttpURL(value) {
    const trimmed = String(value || "").trim()
    if (!trimmed) {
      return ""
    }

    try {
      const url = new URL(trimmed)
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href
      }
    } catch (_) {}

    return ""
  }

  function normalizeSubscriptionInput(value) {
    const trimmed = String(value || "").trim()
    const directURL = normalizeHttpURL(trimmed)
    if (directURL) {
      return directURL
    }

    if (!trimmed.startsWith("clash://install-config?")) {
      return ""
    }

    try {
      const query = trimmed.slice("clash://install-config?".length)
      const importURL = new URLSearchParams(query).get("url") || ""
      return normalizeHttpURL(importURL)
    } catch (_) {
      return ""
    }
  }

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true })
    } else {
      callback()
    }
  }

  function yamlQuote(value) {
    return JSON.stringify(String(value || ""))
  }

  function validDomainRuleHost(host) {
    return Boolean(
      host &&
        /^[A-Za-z0-9.-]+$/.test(host) &&
        !/^[0-9.]+$/.test(host) &&
        !host.startsWith(".") &&
        !host.endsWith(".") &&
        !host.includes(".."),
    )
  }

  function getSubscriptionDomainRule(subscriptionURL) {
    try {
      const host = new URL(subscriptionURL).hostname
      if (validDomainRuleHost(host)) {
        return `  - DOMAIN-SUFFIX,${host},DIRECT\n`
      }
    } catch (_) {}

    return ""
  }

  function buildSubscriptionConfig(subscriptionURL) {
    const directRule = getSubscriptionDomainRule(subscriptionURL)
    return `mixed-port: 7899
allow-lan: true
bind-address: "*"
mode: rule
log-level: info
ipv6: false
external-controller: 127.0.0.1:9090
external-ui: dashboard
secret: ${yamlQuote(localEndpoint.secret)}
geo-auto-update: false

profile:
  store-selected: true
  store-fake-ip: true

dns:
  enable: true
  listen: 0.0.0.0:1053
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - 223.5.5.5
    - 119.29.29.29
    - 1.1.1.1
    - 8.8.8.8
  fallback:
    - 1.1.1.1
    - 8.8.8.8

proxy-providers:
  subscription:
    type: http
    url: ${yamlQuote(subscriptionURL)}
    proxy: DIRECT
    interval: 86400
    path: ./providers/subscription.yaml
    health-check:
      enable: false
      interval: 600
      url: https://www.gstatic.com/generate_204

proxies: []

proxy-groups:
  - name: 自动选择
    type: url-test
    use:
      - subscription
    url: https://www.gstatic.com/generate_204
    interval: 600
    tolerance: 50
  - name: PROXY
    type: select
    proxies:
      - 自动选择
      - DIRECT
    use:
      - subscription

rules:
${directRule}  - MATCH,PROXY
`
  }

  function controllerAuthHeaders(includeJSON) {
    const headers = {}
    if (includeJSON) {
      headers["content-type"] = "application/json"
    }
    if (localEndpoint.secret) {
      headers.Authorization = `Bearer ${localEndpoint.secret}`
    }
    return headers
  }

  async function readControllerError(response) {
    let body = ""
    try {
      body = await response.text()
    } catch (_) {}
    return body || `${response.status} ${response.statusText}`.trim() || "请求失败"
  }

  function createTimeoutError(timeoutMs) {
    const error = new Error(
      `加载配置超时（${Math.round(timeoutMs / 1000)} 秒）。mihomo 可能仍在后台拉取订阅，请稍后查看“代理”页；如果仍没有节点，请确认 NAS 能直连访问订阅地址，或用安装向导 / config.yaml 写入持久配置后重启。`,
    )
    error.name = "ClashMetaTimeoutError"
    return error
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    if (!window.AbortController) {
      return window.fetch(url, options)
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await window.fetch(url, {
        ...options,
        signal: controller.signal,
      })
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw createTimeoutError(timeoutMs)
      }
      throw error
    } finally {
      window.clearTimeout(timer)
    }
  }

  async function applyRuntimeConfig(payload) {
    const response = await fetchWithTimeout(
      `${backendURL}/_fnos/config`,
      {
        method: "POST",
        headers: controllerAuthHeaders(true),
        body: JSON.stringify({ payload }),
      },
      runtimeConfigTimeoutMs,
    )

    if (!response.ok) {
      const detail = await readControllerError(response)
      throw new Error(`mihomo 拒绝加载配置: ${detail}`)
    }
  }

  async function refreshSubscriptionProvider() {
    try {
      await fetchWithTimeout(
        `${backendURL}/providers/proxies/subscription`,
        {
          method: "PUT",
          headers: controllerAuthHeaders(false),
        },
        providerRefreshTimeoutMs,
      )
    } catch (_) {}
  }

  async function applySubscriptionConfig(subscriptionURL) {
    await applyRuntimeConfig(buildSubscriptionConfig(subscriptionURL))
    window.setTimeout(refreshSubscriptionProvider, 1200)
  }

  function routeToProxies() {
    if (window.location.hash !== "#/proxies") {
      window.location.hash = "/proxies"
    }
  }

  function showImportHint(message, tone) {
    let hint = document.getElementById("clash-meta-subscription-hint")
    if (!hint) {
      hint = document.createElement("div")
      hint.id = "clash-meta-subscription-hint"
      hint.innerHTML = [
        '<span class="clash-meta-subscription-hint__text"></span>',
        '<button type="button" class="clash-meta-subscription-hint__button">关闭</button>',
      ].join("")
      document.body.appendChild(hint)
    }

    hint.className = `clash-meta-subscription-hint${
      tone === "error" ? " clash-meta-subscription-hint--error" : ""
    }`
    hint.querySelector(".clash-meta-subscription-hint__text").textContent = message

    const closeButton = hint.querySelector("button")
    closeButton.onclick = () => {
      hint.remove()
    }
  }

  function installSubscriptionToolStyle() {
    if (document.getElementById("clash-meta-subscription-tool-style")) {
      return
    }

    const style = document.createElement("style")
    style.id = "clash-meta-subscription-tool-style"
    style.textContent = `
      .clash-meta-subscription-tool__trigger {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 2147482600;
        min-height: 38px;
        border: 1px solid rgba(37, 99, 235, 0.28);
        border-radius: 8px;
        padding: 8px 12px;
        color: #ffffff;
        background: #2563eb;
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.22);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }

      .clash-meta-subscription-tool__trigger:hover {
        background: #1d4ed8;
      }

      .clash-meta-subscription-tool {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(15, 23, 42, 0.46);
        color: #0f172a;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .clash-meta-subscription-tool__panel {
        width: min(480px, 100%);
        border: 1px solid rgba(148, 163, 184, 0.38);
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
      }

      .clash-meta-subscription-tool__body {
        padding: 22px;
      }

      .clash-meta-subscription-tool__title {
        margin: 0;
        font-size: 20px;
        line-height: 1.3;
        font-weight: 700;
      }

      .clash-meta-subscription-tool__desc {
        margin: 10px 0 0;
        color: #475569;
        font-size: 14px;
        line-height: 1.6;
      }

      .clash-meta-subscription-tool__label {
        display: block;
        margin: 18px 0 8px;
        color: #334155;
        font-size: 13px;
        font-weight: 600;
      }

      .clash-meta-subscription-tool__input {
        box-sizing: border-box;
        width: 100%;
        min-height: 42px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        padding: 8px 11px;
        color: #0f172a;
        background: #ffffff;
        font-size: 14px;
        outline: none;
      }

      .clash-meta-subscription-tool__input:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.16);
      }

      .clash-meta-subscription-tool__error {
        min-height: 20px;
        margin: 8px 0 0;
        color: #b91c1c;
        font-size: 13px;
        line-height: 1.5;
      }

      .clash-meta-subscription-tool__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
        margin-top: 18px;
      }

      .clash-meta-subscription-tool__button {
        min-height: 38px;
        border: 1px solid transparent;
        border-radius: 6px;
        padding: 8px 14px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
      }

      .clash-meta-subscription-tool__button--secondary {
        border-color: #cbd5e1;
        color: #334155;
        background: #ffffff;
      }

      .clash-meta-subscription-tool__button--primary {
        color: #ffffff;
        background: #2563eb;
      }

      .clash-meta-subscription-hint {
        position: fixed;
        top: 14px;
        left: 50%;
        z-index: 2147483001;
        display: flex;
        max-width: min(520px, calc(100% - 24px));
        transform: translateX(-50%);
        align-items: center;
        gap: 12px;
        border: 1px solid rgba(37, 99, 235, 0.3);
        border-radius: 8px;
        padding: 10px 12px;
        background: #eff6ff;
        color: #1e3a8a;
        box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        line-height: 1.5;
      }

      .clash-meta-subscription-hint--error {
        border-color: rgba(220, 38, 38, 0.28);
        background: #fef2f2;
        color: #991b1b;
      }

      .clash-meta-subscription-hint__text {
        min-width: 0;
      }

      .clash-meta-subscription-hint__button {
        flex: 0 0 auto;
        border: 1px solid rgba(37, 99, 235, 0.42);
        border-radius: 6px;
        padding: 5px 9px;
        color: #1d4ed8;
        background: #ffffff;
        cursor: pointer;
        font-size: 13px;
      }

      .clash-meta-subscription-hint--error .clash-meta-subscription-hint__button {
        border-color: rgba(220, 38, 38, 0.36);
        color: #b91c1c;
      }

      @media (max-width: 640px) {
        .clash-meta-subscription-tool__trigger {
          right: 12px;
          bottom: 12px;
        }
      }

      @media (prefers-color-scheme: dark) {
        .clash-meta-subscription-tool {
          background: rgba(2, 6, 23, 0.62);
          color: #e5e7eb;
        }

        .clash-meta-subscription-tool__panel {
          border-color: rgba(71, 85, 105, 0.72);
          background: #0f172a;
        }

        .clash-meta-subscription-tool__desc,
        .clash-meta-subscription-tool__label {
          color: #cbd5e1;
        }

        .clash-meta-subscription-tool__input {
          border-color: #475569;
          color: #e5e7eb;
          background: #111827;
        }

        .clash-meta-subscription-tool__button--secondary {
          border-color: #475569;
          color: #e5e7eb;
          background: #111827;
        }
      }
    `
    document.head.appendChild(style)
  }

  function clearLegacySubscriptionState() {
    removeStorage(legacySubscriptionPendingUrlKey)
    removeStorage(legacySubscriptionDraftUrlKey)
  }

  function getDraftConfigImportURL() {
    return readStorage(configImportDraftUrlKey) || readStorage(legacySubscriptionDraftUrlKey)
  }

  function setSubmitState(submitButton, loading) {
    if (!submitButton) {
      return
    }
    submitButton.disabled = loading
    submitButton.textContent = loading ? "正在加载..." : "应用配置"
  }

  function getErrorMessage(error) {
    if (!error) {
      return "未知错误"
    }
    if (error.message) {
      return error.message
    }
    return String(error)
  }

  function openConfigImportDialog() {
    if (document.querySelector(".clash-meta-subscription-tool")) {
      return
    }

    installSubscriptionToolStyle()

    const overlay = document.createElement("div")
    overlay.className = "clash-meta-subscription-tool"
    overlay.setAttribute("role", "dialog")
    overlay.setAttribute("aria-modal", "true")
    overlay.setAttribute("aria-labelledby", "clash-meta-subscription-tool-title")
    overlay.innerHTML = [
      '<div class="clash-meta-subscription-tool__panel">',
      '<form class="clash-meta-subscription-tool__body">',
      '<h2 id="clash-meta-subscription-tool-title" class="clash-meta-subscription-tool__title">配置订阅</h2>',
      '<p class="clash-meta-subscription-tool__desc">支持 http(s) 订阅和 clash://install-config 链接。应用后会写入飞牛应用文件里的 config.yaml，并立即让 mihomo 重新加载。</p>',
      '<label class="clash-meta-subscription-tool__label" for="clash-meta-subscription-tool-url">订阅 / 导入链接</label>',
      '<input id="clash-meta-subscription-tool-url" class="clash-meta-subscription-tool__input" type="text" inputmode="url" autocomplete="off" placeholder="https://... 或 clash://install-config?url=..." />',
      '<p class="clash-meta-subscription-tool__error" aria-live="polite"></p>',
      '<div class="clash-meta-subscription-tool__actions">',
      '<button type="button" class="clash-meta-subscription-tool__button clash-meta-subscription-tool__button--secondary" data-action="cancel">取消</button>',
      '<button type="submit" class="clash-meta-subscription-tool__button clash-meta-subscription-tool__button--primary">应用配置</button>',
      "</div>",
      "</form>",
      "</div>",
    ].join("")
    document.body.appendChild(overlay)

    const form = overlay.querySelector("form")
    const input = overlay.querySelector("input")
    const error = overlay.querySelector(".clash-meta-subscription-tool__error")
    const cancelButton = overlay.querySelector('[data-action="cancel"]')
    const submitButton = overlay.querySelector('button[type="submit"]')
    const draftURL = getDraftConfigImportURL()

    if (draftURL) {
      input.value = draftURL
    }

    input.addEventListener("input", () => {
      writeStorage(configImportDraftUrlKey, input.value.trim())
      error.textContent = ""
    })

    cancelButton.addEventListener("click", () => {
      overlay.remove()
    })

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.remove()
      }
    })

    form.addEventListener("submit", async (event) => {
      event.preventDefault()
      const value = normalizeSubscriptionInput(input.value)
      if (!value) {
        error.textContent = "请输入 http(s) 订阅或 clash://install-config 导入链接。"
        input.focus()
        return
      }

      setSubmitState(submitButton, true)
      error.textContent = ""
      try {
        await applySubscriptionConfig(value)
        removeStorage(configImportDraftUrlKey)
        clearLegacySubscriptionState()
        overlay.remove()
        routeToProxies()
        showImportHint("配置已写入 config.yaml 并加载，重启应用后仍然保留。")
      } catch (applyError) {
        error.textContent = getErrorMessage(applyError)
        showImportHint("配置没有写入或加载成功，旧配置已保留。请检查订阅地址和 mihomo 日志。", "error")
        setSubmitState(submitButton, false)
      }
    })

    window.setTimeout(() => input.focus(), 50)
  }

  function installConfigImportButton() {
    if (document.getElementById("clash-meta-subscription-tool-trigger")) {
      return
    }

    const button = document.createElement("button")
    button.id = "clash-meta-subscription-tool-trigger"
    button.className = "clash-meta-subscription-tool__trigger"
    button.type = "button"
    button.textContent = "配置"
    button.setAttribute("aria-label", "配置订阅")
    button.addEventListener("click", openConfigImportDialog)
    document.body.appendChild(button)
  }

  onReady(() => {
    installSubscriptionToolStyle()
    installConfigImportButton()
    clearLegacySubscriptionState()
  })
})()
