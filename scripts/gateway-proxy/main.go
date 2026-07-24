package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const maxConfigSize = 4 << 20

type server struct {
	prefix     string
	configPath string
	secretFile string
	target     *url.URL
	proxy      *httputil.ReverseProxy
	client     *http.Client
}

type configRequest struct {
	Payload string `json:"payload"`
}

func main() {
	var socketPath string
	var prefix string
	var targetURL string
	var configPath string
	var secretFile string

	flag.StringVar(&socketPath, "socket", "clash-meta.sock", "Unix socket path")
	flag.StringVar(&prefix, "prefix", "/app/clash-meta", "fnOS gateway prefix")
	flag.StringVar(&targetURL, "target", "http://127.0.0.1:9090", "mihomo controller URL")
	flag.StringVar(&configPath, "config", "", "persistent mihomo config path")
	flag.StringVar(&secretFile, "secret-file", "", "controller secret file")
	flag.Parse()

	target, err := url.Parse(targetURL)
	if err != nil || target.Scheme == "" || target.Host == "" {
		log.Fatalf("invalid target URL %q", targetURL)
	}
	prefix = "/" + strings.Trim(strings.TrimSpace(prefix), "/")
	if prefix == "/" {
		log.Fatal("gateway prefix must not be root")
	}
	if configPath == "" || secretFile == "" {
		log.Fatal("config and secret-file are required")
	}

	if err := os.Remove(socketPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("remove stale socket: %v", err)
	}
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		log.Fatalf("listen on %s: %v", socketPath, err)
	}
	defer listener.Close()
	if err := os.Chmod(socketPath, 0o660); err != nil {
		log.Fatalf("chmod socket: %v", err)
	}

	s := &server{
		prefix:     prefix,
		configPath: configPath,
		secretFile: secretFile,
		target:     target,
		client:     &http.Client{Timeout: 35 * time.Second},
	}
	s.proxy = httputil.NewSingleHostReverseProxy(target)
	originalDirector := s.proxy.Director
	s.proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.URL.Path = stripPrefix(req.URL.Path, prefix)
		req.URL.RawPath = ""
		req.Host = target.Host
	}
	s.proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, proxyErr error) {
		log.Printf("proxy error: %v", proxyErr)
		http.Error(w, "mihomo controller is unavailable", http.StatusBadGateway)
	}

	httpServer := &http.Server{
		Handler:           s,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       90 * time.Second,
	}
	log.Printf("fnOS gateway listening on %s, prefix=%s", socketPath, prefix)
	if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func stripPrefix(path, prefix string) string {
	path = strings.TrimPrefix(path, prefix)
	if path == "" {
		return "/"
	}
	if !strings.HasPrefix(path, "/") {
		return "/" + path
	}
	return path
}

func (s *server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == s.prefix || r.URL.Path == s.prefix+"/" {
		http.Redirect(w, r, s.prefix+"/ui/", http.StatusTemporaryRedirect)
		return
	}
	if r.URL.Path == s.prefix+"/_fnos/config" {
		s.handleConfig(w, r)
		return
	}
	if r.URL.Path != s.prefix && !strings.HasPrefix(r.URL.Path, s.prefix+"/") {
		http.NotFound(w, r)
		return
	}
	s.proxy.ServeHTTP(w, r)
}

func (s *server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Trim-Isadmin")), "true") {
		http.Error(w, "fnOS administrator permission required", http.StatusForbidden)
		return
	}

	reader := http.MaxBytesReader(w, r.Body, maxConfigSize)
	defer reader.Close()
	var request configRequest
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "invalid JSON request", http.StatusBadRequest)
		return
	}
	if err := validateConfig(request.Payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.persistAndReload([]byte(request.Payload)); err != nil {
		log.Printf("persist config: %v", err)
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, `{"ok":true}`)
}

func validateConfig(payload string) error {
	if strings.TrimSpace(payload) == "" {
		return errors.New("configuration is empty")
	}
	if len(payload) > maxConfigSize {
		return errors.New("configuration is too large")
	}
	required := []string{"mixed-port:", "external-controller:", "proxy-groups:", "rules:"}
	for _, item := range required {
		if !strings.Contains(payload, item) {
			return fmt.Errorf("configuration is missing %s", item)
		}
	}
	return nil
}

func (s *server) persistAndReload(payload []byte) error {
	dir := filepath.Dir(s.configPath)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}
	old, readErr := os.ReadFile(s.configPath)
	if readErr != nil && !errors.Is(readErr, os.ErrNotExist) {
		return fmt.Errorf("read current config: %w", readErr)
	}

	temp, err := os.CreateTemp(dir, ".config.yaml.*")
	if err != nil {
		return fmt.Errorf("create temporary config: %w", err)
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return fmt.Errorf("set config permissions: %w", err)
	}
	if _, err := temp.Write(payload); err != nil {
		temp.Close()
		return fmt.Errorf("write temporary config: %w", err)
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return fmt.Errorf("sync temporary config: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("close temporary config: %w", err)
	}

	if len(old) > 0 {
		if err := os.WriteFile(s.configPath+".bak", old, 0o600); err != nil {
			return fmt.Errorf("backup current config: %w", err)
		}
	}
	if err := os.Rename(tempPath, s.configPath); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}
	if err := s.reload(); err != nil {
		if len(old) > 0 {
			_ = os.WriteFile(s.configPath, old, 0o600)
		}
		return err
	}
	return nil
}

func (s *server) reload() error {
	secretBytes, err := os.ReadFile(s.secretFile)
	if err != nil {
		return fmt.Errorf("read controller secret: %w", err)
	}
	body, _ := json.Marshal(map[string]string{"path": s.configPath})
	reloadURL := *s.target
	reloadURL.Path = "/configs"
	query := reloadURL.Query()
	query.Set("force", "true")
	reloadURL.RawQuery = query.Encode()
	req, err := http.NewRequest(http.MethodPut, reloadURL.String(), bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create reload request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	secret := strings.TrimSpace(string(secretBytes))
	if secret != "" {
		req.Header.Set("Authorization", "Bearer "+secret)
	}
	response, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("reload mihomo config: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		detail, _ := io.ReadAll(io.LimitReader(response.Body, 8<<10))
		return fmt.Errorf("mihomo rejected config: %s %s", response.Status, strings.TrimSpace(string(detail)))
	}
	return nil
}
