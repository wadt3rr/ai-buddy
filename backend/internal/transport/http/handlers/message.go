package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"time"

	"uuid"

	"github.com/wadt3rr/ai-buddy/internal/auth"
	"github.com/wadt3rr/ai-buddy/internal/message"
	"github.com/wadt3rr/ai-buddy/internal/transport/http/response"
)

type MessageHandler struct {
	messages *message.Service
}

func NewMessageHandler(messages *message.Service) *MessageHandler {
	return &MessageHandler{messages: messages}
}

type createMessageRequest struct {
	Content string `json:"content"`
}

type messageResponse struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type listMessagesResponse struct {
	Messages   []messageResponse `json:"messages"`
	NextBefore *string           `json:"next_before"`
}

func (h *MessageHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req createMessageRequest

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&req); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			response.Error(w, http.StatusRequestEntityTooLarge, "body_too_large", "Request body is too large")
			return
		}

		response.Error(w, http.StatusBadRequest, "invalid_request", "Invalid JSON body")
		return
	}

	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		response.Error(w, http.StatusBadRequest, "invalid_request", "Request body must contain a single JSON object")
		return
	}

	result, err := h.messages.SendMessage(r.Context(), userID, req.Content)
	if err != nil {
		switch {
		case errors.Is(err, message.ErrEmptyContent):
			response.Error(w, http.StatusBadRequest, "empty_content", err.Error())
		case errors.Is(err, message.ErrContentTooLong):
			response.Error(w, http.StatusBadRequest, "content_too_long", err.Error())
		default:
			if result != nil && result.UserMessage != nil {
				response.JSON(w, http.StatusBadGateway, map[string]any{
					"error": map[string]string{
						"code":    "assistant_unavailable",
						"message": "Message was saved, but assistant response could not be generated",
					},
					"user_message": messageResponse{
						ID:        result.UserMessage.ID.String(),
						Role:      string(result.UserMessage.Role),
						Content:   result.UserMessage.Content,
						CreatedAt: result.UserMessage.CreatedAt,
					},
				})
				return
			}

			response.Error(w, http.StatusInternalServerError, "internal_error", "Failed to process message")
		}
		return
	}

	response.JSON(w, http.StatusCreated, map[string]any{
		"user_message": messageResponse{
			ID:        result.UserMessage.ID.String(),
			Role:      string(result.UserMessage.Role),
			Content:   result.UserMessage.Content,
			CreatedAt: result.UserMessage.CreatedAt,
		},
		"assistant_message": messageResponse{
			ID:        result.AssistantMessage.ID.String(),
			Role:      string(result.AssistantMessage.Role),
			Content:   result.AssistantMessage.Content,
			CreatedAt: result.AssistantMessage.CreatedAt,
		},
	})
}

func (h *MessageHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized, "unauthorized", "Authentication required")
		return
	}

	limit := message.DefaultPageSize

	if rawLimit := r.URL.Query().Get("limit"); rawLimit != "" {
		parsedLimit, err := strconv.Atoi(rawLimit)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "invalid_limit", "Limit must be an integer")
			return
		}
		limit = parsedLimit
	}

	var beforeID *uuid.UUID

	if rawBefore := r.URL.Query().Get("before"); rawBefore != "" {
		id, err := uuid.Parse(rawBefore)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "invalid_cursor", "Before must be a valid UUID")
			return
		}
		beforeID = &id
	}

	messages, hasMore, err := h.messages.List(
		r.Context(),
		userID,
		beforeID,
		limit,
	)
	if err != nil {
		switch {
		case errors.Is(err, message.ErrInvalidLimit):
			response.Error(w, http.StatusBadRequest, "invalid_limit", "Limit must be between 1 and 100")
		case errors.Is(err, message.ErrCursorNotFound):
			response.Error(w, http.StatusBadRequest, "invalid_cursor", "Cursor message not found")
		default:
			response.Error(w, http.StatusInternalServerError, "internal_error", "Failed to list messages")
		}
		return
	}

	result := listMessagesResponse{
		Messages: make([]messageResponse, 0, len(messages)),
	}

	for _, msg := range messages {
		result.Messages = append(result.Messages, messageResponse{
			ID:        msg.ID.String(),
			Role:      string(msg.Role),
			Content:   msg.Content,
			CreatedAt: msg.CreatedAt,
		})
	}

	if hasMore && len(messages) > 0 {
		cursor := messages[0].ID.String()
		result.NextBefore = &cursor
	}

	response.JSON(w, http.StatusOK, result)
}
