# EduConnect Backend

## Overview

EduConnect is a real-time interactive education platform backend built with Node.js, Express, MongoDB, and Socket.io. It supports user management, class sessions, polls, chat, monitoring, notifications, and analytics.

## Project Structure

- `/backend` - Backend source code (server, routes, models, services)
- `/public` - Frontend static assets (HTML, CSS, JS, images)
- `/logs` - Log files (application and access logs)
- `/docs` - Documentation (API, socket events, deployment, architecture)

## Setup Instructions

1. Clone the repository  
2. Navigate to `/backend`  
3. Run `npm install` to install dependencies  
4. Create a `.env` file based on `.env.example` and fill in environment variables  
5. Start MongoDB locally or connect to a cloud MongoDB instance  
6. Run `npm start` to start the backend server  
7. Visit `http://localhost:3000` to access the frontend  

## Testing

Run tests using Jest:  
