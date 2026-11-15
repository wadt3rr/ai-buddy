import type { FC } from "react"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import { ChatPage, LoginPage } from "@/pages"
import { ProtectedRoute } from "@/components/ProtectedRoute"

const router = createBrowserRouter([
  {
    element: <ProtectedRoute guestOnly />,
    children: [{ path: "/", element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [{ path: "/chat", element: <ChatPage /> }],
  },
])

export const RouterComponent: FC = () => {
  return <RouterProvider router={router} />
}
