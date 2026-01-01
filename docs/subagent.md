# NaTalk Sub-Agent Development Guide

This document outlines the development tasks for the NaTalk project, based on the main project plan and additional user requests.

## 1. Core Backend (Node.js, Express, Socket.io)

-   **Server Setup**:
    -   Use Express and Socket.io on port 3002.
    -   Set up Dockerfile and .dockerignore for containerization.
-   **Room & Chat Data**:
    -   Use JSON files for data storage (`data/`).
    -   Create a new file for each chat room (e.g., `[roomId].json`).
    -   Chat logs should be deleted after 24 hours.
-   **Socket Security Middleware**:
    -   Implement middleware to control access to Socket.io rooms.
    -   Allow connection only with a valid `roomToken` (invite code).
    -   Verify the room password.
    -   Enforce a 10-user limit per room.
-   **Room Creation API**:
    -   Create an endpoint to generate a new chat room.
    -   Generate a unique `roomId` (e.g., using `uuid` or a simple function).
    -   Save the room password (`roomPassword`).
    -   Assign the creator as the room owner (`ownerId`).
-   **Room Master/Owner Features**:
    -   Implement a mechanism to identify and log in as the "방장" (room owner).
    -   Implement "kick user" functionality for the owner.
    -   Implement "destroy room" functionality for the owner.

## 2. Core Frontend (React, Tailwind CSS)

-   **Project Setup**:
    -   React with Vite.
    -   Tailwind CSS for styling.
-   **UI Components**:
    -   `CreateRoomForm.jsx`: Form for room creation (name, password).
    -   `LoginForm.jsx`: Form to enter invite code and room password.
    -   `ChatRoom.jsx`: The main chat interface.
    -   `ProfileSetupModal.jsx`: Modal for setting up a user profile.
-   **Auto-Login Flow**:
    -   Create a custom hook (`useAuth.jsx`) to manage authentication.
    -   On successful login, store the `roomToken` in `localStorage`.
    -   On app start, check `localStorage` for the token. If present, bypass the login screen and go directly to the `ChatRoom`.
-   **UI Design (KakaoTalk Style)**:
    -   **Background**: Light blue (`#ABC1D1`).
    -   **Chat Bubbles**:
        -   User's messages: Yellow (`#FEE500`), right-aligned.
        -   Others' messages: White, left-aligned.
        -   Rounded corners with a small tail.
    -   **Input Bar**: Fixed at the bottom, white background, with a yellow or blue send button.
    -   **Timestamps**: Small font next to each message (`HH:mm`).
-   **Profile Images**:
    -   Implement profile images using the 12 Chinese zodiac animal characters.
    -   Allow users to select or be assigned one of these characters.

## 3. Monetization (QR Code Payment)

-   **Room Creation Flow**:
    1.  User clicks 'Create Room'.
    2.  A modal displays a static QR code image for a ₩10,000 payment (e.g., a KakaoPay/Toss transfer QR).
    3.  The room creation form (ID, PW) is disabled until payment is "confirmed".
-   **Payment "Confirmation" (Manual)**:
    -   The user makes the manual transfer.
    -   User clicks an "I have paid" button.
    -   This triggers a notification to the admin (e.g., email or message).
    -   The admin manually verifies the payment and approves it via an admin interface/tool.
    -   Once approved, the server updates the payment status.
    -   The client polls for the status change and, upon confirmation, enables the room creation form.
-   **Server-side Logic**:
    -   Create a simple endpoint to track payment status (e.g., `pending`, `approved`).
    -   Create a protected endpoint for the admin to approve a payment.
-   **Client-side Component**:
    -   Update `client/src/components/CreateRoom.tsx` (or `.jsx`) to include the payment modal and status polling logic.
