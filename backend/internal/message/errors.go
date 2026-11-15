package message

import "errors"

var (
	ErrEmptyContent           = errors.New("message content is required")
	ErrContentTooLong         = errors.New("message content is too long")
	ErrInvalidLimit           = errors.New("invalid message limit")
	ErrCursorNotFound         = errors.New("message cursor not found")
	ErrEmptyAssistantResponse = errors.New("assistant returned an empty response")
)
