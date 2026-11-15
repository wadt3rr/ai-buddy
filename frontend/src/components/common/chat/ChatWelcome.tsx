import { useState, type FormEvent, type KeyboardEvent } from "react"

import { motion, useReducedMotion } from "motion/react"
import { ArrowUp } from "lucide-react"

import { Button } from "@/components/ui/button"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/components/ui/input-group"

type ChatWelcomeProps = {
  onSend?: (message: string) => void
}

export function ChatWelcome({ onSend }: ChatWelcomeProps) {
  const [message, setMessage] = useState("")
  const reduceMotion = useReducedMotion()

  const canSend = message.trim().length > 0

  const handleSubmit = (event?: FormEvent) => {
    event?.preventDefault()

    if (!canSend || !onSend) return

    onSend(message.trim())
    setMessage("")
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <section className="relative z-10 mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col items-center sm:min-h-0 sm:flex-none">
      {/* Приветствие */}
      <div className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center sm:mb-12 sm:flex-none">
        <div className="overflow-hidden pb-2">
          <motion.h1
            initial={
              reduceMotion
                ? false
                : {
                    opacity: 0,
                    y: 18,
                  }
            }
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="font-heading text-4xl leading-[1.12] font-medium tracking-[-0.055em] sm:text-6xl"
          >
            Большие дела
            <br />
            начинаются с{" "}
            <span className="relative inline-block whitespace-nowrap">
              <motion.span
                aria-hidden="true"
                className="absolute -inset-x-1.5 top-[12%] bottom-[8%] -rotate-2 bg-avito-purple-light"
                style={{
                  transformOrigin: "left center",
                }}
                initial={
                  reduceMotion
                    ? false
                    : {
                        scaleX: 0,
                      }
                }
                animate={{
                  scaleX: 1,
                }}
                transition={{
                  duration: 0.35,
                  delay: reduceMotion ? 0 : 0.35,
                  ease: [0.76, 0, 0.24, 1],
                }}
              />

              <span className="relative z-10 text-black">вопросов.</span>
            </span>
          </motion.h1>
        </div>
        <motion.p
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  y: 12,
                }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.35,
            delay: reduceMotion ? 0 : 0.3,
          }}
          className="mx-auto mt-6 max-w-lg"
        >
          Осваивайся, знакомься с командой и спрашивай обо всём.
          <br />Я помогу разобраться.
        </motion.p>
      </div>
      {/* Поле ввода */}
      <motion.div
        initial={
          reduceMotion
            ? false
            : {
                opacity: 0,
                y: 45,
                scale: 0.97,
              }
        }
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
        }}
        transition={{
          duration: 0.5,
          delay: reduceMotion ? 0 : 0.2,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="relative isolate mt-auto w-full sm:mt-0"
      >
        <form onSubmit={handleSubmit}>
          <InputGroup className="shrink-0">
            <InputGroupTextarea
              id="block-end-textarea"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="О чём хочешь узнать?"
              aria-label="Сообщение для AI Buddy"
              className="max-h-50 min-h-30 resize-none [scrollbar-width:none] overflow-y-auto p-4 text-lg! sm:min-h-40 [&::-webkit-scrollbar]:hidden"
            />

            <InputGroupAddon align="block-end">
              <motion.div
                className="ml-auto"
                whileTap={
                  reduceMotion
                    ? undefined
                    : {
                        scale: 0.9,
                      }
                }
                transition={{
                  duration: 0.18,
                  ease: [0.2, 0.8, 0.2, 1],
                }}
              >
                <Button
                  type="submit"
                  variant="default"
                  size="icon-lg"
                  aria-label="Отправить сообщение"
                  disabled={!canSend || !onSend}
                  className="size-12"
                >
                  <ArrowUp />
                </Button>
              </motion.div>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </motion.div>
    </section>
  )
}
