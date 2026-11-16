package assistant

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// HTTPClient connects the existing message service to the internal Python API.
type HTTPClient struct {
	baseURL string
	token   string
	client  *http.Client
}

func NewHTTPClient(baseURL, token string, timeout time.Duration) (*HTTPClient, error) {
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || token == "" || timeout <= 0 {
		return nil, fmt.Errorf("valid assistant URL, token and timeout are required")
	}
	return &HTTPClient{strings.TrimRight(baseURL, "/"), token, &http.Client{Timeout: timeout}}, nil
}

func (c *HTTPClient) call(ctx context.Context, method, path string, payload []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("assistant request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("assistant HTTP status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024+1))
	if err != nil {
		return nil, err
	}
	if len(body) > 1024*1024 {
		return nil, fmt.Errorf("assistant response too large")
	}
	return body, nil
}

func (c *HTTPClient) Generate(ctx context.Context, req Request) (*Response, error) {
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	body, err := c.call(ctx, http.MethodPost, "/generate", payload)
	if err != nil {
		return nil, err
	}
	var result Response
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode assistant response: %w", err)
	}
	if strings.TrimSpace(result.Content) == "" {
		return nil, fmt.Errorf("empty assistant response")
	}
	return &result, nil
}

func (c *HTTPClient) Source(ctx context.Context, id, role string) ([]byte, error) {
	return c.call(ctx, http.MethodGet, "/sources/"+url.PathEscape(id)+"?team_role="+url.QueryEscape(role), nil)
}

func (c *HTTPClient) Tickets(ctx context.Context, userID string) ([]byte, error) {
	return c.call(ctx, http.MethodGet, "/tickets/"+url.PathEscape(userID), nil)
}

var _ Client = (*HTTPClient)(nil)
