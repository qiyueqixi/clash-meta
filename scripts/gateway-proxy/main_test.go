package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestServer(t *testing.T, backend *httptest.Server, configPath, secretFile string) *server {
	t.Helper()
	target, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatal(err)
	}
	s := &server{
		prefix:     "/app/clash-meta",
		configPath: configPath,
		secretFile: secretFile,
		target:     target,
		client:     backend.Client(),
	}
	s.proxy = httputilProxy(target, s.prefix)
	return s
}

func httputilProxy(target *url.URL, prefix string) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	original := proxy.Director
	proxy.Director = func(req *http.Request) {
		original(req)
		req.URL.Path = stripPrefix(req.URL.Path, prefix)
		req.URL.RawPath = ""
	}
	return proxy
}

func TestProxyStripsGatewayPrefix(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, r.URL.Path)
	}))
	defer backend.Close()

	s := newTestServer(t, backend, "unused", "unused")
	request := httptest.NewRequest(http.MethodGet, "/app/clash-meta/ui/config.js", nil)
	response := httptest.NewRecorder()
	s.ServeHTTP(response, request)
	if response.Code != http.StatusOK || response.Body.String() != "/ui/config.js" {
		t.Fatalf("unexpected proxy response: status=%d body=%q", response.Code, response.Body.String())
	}
}

func TestConfigWriteRequiresAdminAndReloads(t *testing.T) {
	tempDir := t.TempDir()
	configPath := filepath.Join(tempDir, "config.yaml")
	secretFile := filepath.Join(tempDir, "secret")
	oldConfig := []byte("old config\n")
	if err := os.WriteFile(configPath, oldConfig, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(secretFile, []byte("test-secret\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	reloaded := false
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPut || r.URL.Path != "/configs" || r.URL.Query().Get("force") != "true" {
			t.Errorf("unexpected reload request: %s %s", r.Method, r.URL.String())
			http.Error(w, "bad reload request", http.StatusBadRequest)
			return
		}
		if r.Header.Get("Authorization") != "Bearer test-secret" {
			t.Errorf("missing controller authorization")
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["path"] != configPath {
			t.Errorf("unexpected reload body: %#v, err=%v", body, err)
		}
		reloaded = true
		w.WriteHeader(http.StatusNoContent)
	}))
	defer backend.Close()

	s := newTestServer(t, backend, configPath, secretFile)
	payload := "mixed-port: 7899\nexternal-controller: 127.0.0.1:9090\nproxy-groups: []\nrules: []\n"
	body, _ := json.Marshal(configRequest{Payload: payload})

	denied := httptest.NewRecorder()
	s.ServeHTTP(denied, httptest.NewRequest(http.MethodPost, "/app/clash-meta/_fnos/config", strings.NewReader(string(body))))
	if denied.Code != http.StatusForbidden {
		t.Fatalf("non-admin request status=%d", denied.Code)
	}

	request := httptest.NewRequest(http.MethodPost, "/app/clash-meta/_fnos/config", strings.NewReader(string(body)))
	request.Header.Set("X-Trim-Isadmin", "true")
	response := httptest.NewRecorder()
	s.ServeHTTP(response, request)
	if response.Code != http.StatusOK || !reloaded {
		t.Fatalf("admin request status=%d reloaded=%v body=%q", response.Code, reloaded, response.Body.String())
	}
	current, err := os.ReadFile(configPath)
	if err != nil || string(current) != payload {
		t.Fatalf("unexpected persisted config: %q err=%v", current, err)
	}
	backup, err := os.ReadFile(configPath + ".bak")
	if err != nil || string(backup) != string(oldConfig) {
		t.Fatalf("unexpected backup: %q err=%v", backup, err)
	}
}
