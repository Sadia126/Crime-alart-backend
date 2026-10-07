# LocalGuard API Testing Guide (Postman)

This document describes how to test all LocalGuard backend APIs using Postman.

## 1. Quick Setup

### Base URL
- Default: `http://localhost:5000`
- API prefix: `/api`
- Example: `http://localhost:5000/api/auth/login`

> Adjust the base URL if you run the server on a different port or host.

### Postman Environment Variables
Create an environment with the following variables:
- `baseUrl` = `http://localhost:5000`
- `authToken` = `` (set after login)
- `adminToken` = `` (optional, for admin-only endpoints)
- `userId` = `` (optional, for tests requiring a specific user)
- `incidentId` = ``
- `postId` = ``
- `blogId` = ``
- `blogSlug` = ``
- `fundingId` = ``
- `contactId` = ``

### Headers
For JSON requests:
- `Content-Type: application/json`
- `Authorization: Bearer {{authToken}}` (when authentication is required)

## 2. Authentication

### 2.1 Register a new user
- Method: `POST`
- URL: `{{baseUrl}}/api/auth/register`
- Body (raw JSON):
```json
{
  "name": "Test User",
  "email": "testuser@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```
- Expected: success response with created user data or error if email exists.

### 2.2 Login
- Method: `POST`
- URL: `{{baseUrl}}/api/auth/login`
- Body (raw JSON):
```json
{
  "email": "testuser@example.com",
  "password": "password123"
}
```
- Expected: JWT token in response.
- Postman: save returned token to `authToken`

### 2.3 Get current user profile
- Method: `GET`
- URL: `{{baseUrl}}/api/auth/me`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: current user object without `passwordHash`.

## 3. User Management

> These endpoints are under `/api/users`.

### 3.1 Get all users (admin only)
- Method: `GET`
- URL: `{{baseUrl}}/api/users`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Query parameters:
  - `status=active|blocked`
  - `role=user|moderator|admin`
  - `search=<name or email>`
  - `page=1`
  - `limit=10`
- Expected: paginated users list.

### 3.2 Get user by ID (admin only)
- Method: `GET`
- URL: `{{baseUrl}}/api/users/{{userId}}`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Expected: user profile.

### 3.3 Update my profile (authenticated user)
- Method: `PATCH`
- URL: `{{baseUrl}}/api/users/profile`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Body example:
```json
{
  "name": "Updated Name",
  "avatar": "https://example.com/avatar.jpg",
  "phone": "01710000000",
  "division": "Dhaka",
  "district": "Dhaka",
  "upazila": "Mirpur"
}
```
- Note: `email` is ignored if provided.
- Expected: updated user object.

### 3.4 Update user status (admin only)
- Method: `PATCH`
- URL: `{{baseUrl}}/api/users/{{userId}}/status`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Body example:
```json
{ "status": "blocked" }
```
- Notes:
  - Allowed values: `active`, `blocked`
  - Admin cannot block themselves.
- Expected: updated user.

### 3.5 Update user role (admin only)
- Method: `PATCH`
- URL: `{{baseUrl}}/api/users/{{userId}}/role`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Body example:
```json
{ "role": "moderator" }
```
- Notes:
  - Allowed values: `user`, `moderator`, `admin`
  - Admin cannot change their own role.
- Expected: updated user.

### 3.6 Delete a user (admin only)
- Method: `DELETE`
- URL: `{{baseUrl}}/api/users/{{userId}}`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Notes: Deletes user, their incidents, and lost-found posts.
- Expected: success message and deleted counts.

## 4. Incident APIs

> These endpoints are under `/api/incidents`.

### 4.1 Get verified incidents (public)
- Method: `GET`
- URL: `{{baseUrl}}/api/incidents`
- Query parameters:
  - `category`, `district`, `upazila`, `status`, `page`, `limit`, `search`
- Expected: filtered incident list.

### 4.2 Get my incidents (authenticated)
- Method: `GET`
- URL: `{{baseUrl}}/api/incidents/my`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: incidents created by current user.

### 4.3 Get incident by ID
- Method: `GET`
- URL: `{{baseUrl}}/api/incidents/{{incidentId}}`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: specific incident details.

### 4.4 Create incident (authenticated active user)
- Method: `POST`
- URL: `{{baseUrl}}/api/incidents`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Body example:
```json
{
  "category": "theft",
  "title": "Stolen bicycle in Mirpur",
  "description": "My bicycle was stolen near the bus stop...",
  "division": "Dhaka",
  "district": "Dhaka",
  "upazila": "Mirpur",
  "incidentDate": "2026-05-27",
  "incidentTime": "15:30",
  "address": "Near Mirpur 10 bus stop",
  "photos": ["https://example.com/photo1.jpg"]
}
```
- Expected: created incident data.

### 4.5 Update incident
- Method: `PUT`
- URL: `{{baseUrl}}/api/incidents/{{incidentId}}`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Body: fields to update.
- Notes: user must own incident or be admin.
- Expected: updated incident.

### 4.6 Delete incident
- Method: `DELETE`
- URL: `{{baseUrl}}/api/incidents/{{incidentId}}`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: success response.

### 4.7 Update incident status (moderator/admin)
- Method: `PATCH`
- URL: `{{baseUrl}}/api/incidents/{{incidentId}}/status`
- Headers:
  - `Authorization: Bearer {{adminToken}}` or moderator token
- Body example:
```json
{ "status": "verified" }
```
- Expected: updated incident status.

### 4.8 Flag incident
- Method: `PATCH`
- URL: `{{baseUrl}}/api/incidents/{{incidentId}}/flag`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: success response after flagging.

## 5. Lost & Found APIs

> These endpoints are under `/api/lost-found`.

### 5.1 Get all active posts (public)
- Method: `GET`
- URL: `{{baseUrl}}/api/lost-found`
- Query parameters:
  - `type`, `district`, `status`, `page`, `limit`, `search`
- Expected: active posts list.

### 5.2 Get my posts
- Method: `GET`
- URL: `{{baseUrl}}/api/lost-found/my`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: current user posts.

### 5.3 Get a single lost/found post
- Method: `GET`
- URL: `{{baseUrl}}/api/lost-found/{{postId}}`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: single post details.

### 5.4 Create a post
- Method: `POST`
- URL: `{{baseUrl}}/api/lost-found`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Body example:
```json
{
  "type": "lost",
  "itemName": "Wallet",
  "category": "documents",
  "description": "Black leather wallet lost near Dhanmondi Lake.",
  "division": "Dhaka",
  "district": "Dhaka",
  "upazila": "Dhanmondi",
  "dateLostFound": "2026-05-27",
  "showContact": true,
  "contactNumber": "01710000000"
}
```
- Expected: created post.

### 5.5 Update a post
- Method: `PUT`
- URL: `{{baseUrl}}/api/lost-found/{{postId}}`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Body: fields to update.
- Expected: updated post.

### 5.6 Mark a post resolved
- Method: `PATCH`
- URL: `{{baseUrl}}/api/lost-found/{{postId}}/resolve`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: success response.

### 5.7 Delete a post
- Method: `DELETE`
- URL: `{{baseUrl}}/api/lost-found/{{postId}}`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Expected: success response.

## 6. Emergency Contact APIs

> These endpoints are under `/api/emergency-contacts`.

### 6.1 Get emergency contacts (public)
- Method: `GET`
- URL: `{{baseUrl}}/api/emergency-contacts`
- Query parameters:
  - `district`, `category`, `division`, `search`, `page`, `limit`
- Expected: list of emergency contacts.

### 6.2 Get a single contact
- Method: `GET`
- URL: `{{baseUrl}}/api/emergency-contacts/{{contactId}}`
- Expected: single contact details.

### 6.3 Create a contact (admin only)
- Method: `POST`
- URL: `{{baseUrl}}/api/emergency-contacts`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Body example:
```json
{
  "name": "Dhaka Police",
  "number": "999",
  "division": "Dhaka",
  "district": "Dhaka",
  "category": "police"
}
```
- Expected: created contact.

### 6.4 Update a contact (admin only)
- Method: `PUT`
- URL: `{{baseUrl}}/api/emergency-contacts/{{contactId}}`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Body: updated fields.
- Expected: updated contact.

### 6.5 Delete a contact (admin only)
- Method: `DELETE`
- URL: `{{baseUrl}}/api/emergency-contacts/{{contactId}}`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Expected: success response.

### 6.6 Seed contacts (admin only)
- Method: `POST`
- URL: `{{baseUrl}}/api/emergency-contacts/seed`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Expected: seed operation result.

## 7. Blog APIs

> These endpoints are under `/api/blogs`.

### 7.1 Get published blogs (public)
- Method: `GET`
- URL: `{{baseUrl}}/api/blogs`
- Query parameters:
  - `page`, `limit`, `search`
- Expected: published blogs list.

### 7.2 Get all blogs (moderator/admin)
- Method: `GET`
- URL: `{{baseUrl}}/api/blogs/all`
- Headers:
  - `Authorization: Bearer {{adminToken}}` or moderator token
- Query parameters:
  - `status=draft|published|all`, `page`, `limit`
- Expected: all blogs for admin/moderator.

### 7.3 Get blog by slug
- Method: `GET`
- URL: `{{baseUrl}}/api/blogs/{{blogSlug}}`
- Expected: blog details.
- Notes: published blogs are public; drafts require auth if implemented.

### 7.4 Create blog (moderator/admin)
- Method: `POST`
- URL: `{{baseUrl}}/api/blogs`
- Headers:
  - `Authorization: Bearer {{adminToken}}` or moderator token
- Body example:
```json
{
  "title": "Community Safety Tips",
  "content": "Use safe routes after dark and report suspicious activity.",
  "thumbnail": "https://example.com/thumb.jpg",
  "tags": ["safety", "community"]
}
```
- Expected: created blog draft.

### 7.5 Update blog
- Method: `PUT`
- URL: `{{baseUrl}}/api/blogs/{{blogId}}`
- Headers:
  - `Authorization: Bearer {{adminToken}}` or moderator token
- Body: update fields.
- Expected: updated blog.

### 7.6 Toggle blog publish status (admin only)
- Method: `PATCH`
- URL: `{{baseUrl}}/api/blogs/{{blogId}}/publish`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Expected: blog publish toggled.

### 7.7 Increment blog view (public)
- Method: `PATCH`
- URL: `{{baseUrl}}/api/blogs/{{blogSlug}}/view`
- Expected: updated view count.

### 7.8 Delete blog (admin only)
- Method: `DELETE`
- URL: `{{baseUrl}}/api/blogs/{{blogId}}`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Expected: success response.

## 8. Funding APIs

> These endpoints are under `/api/funding`.

### 8.1 Get funding history (authenticated)
- Method: `GET`
- URL: `{{baseUrl}}/api/funding`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Query parameters: `page`, `limit`
- Expected: user funding history.

### 8.2 Create Stripe payment intent (authenticated)
- Method: `POST`
- URL: `{{baseUrl}}/api/funding/create-payment-intent`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Body example:
```json
{ "amount": 500 }
```
- Expected: `clientSecret`, `fundingId`.

### 8.3 Confirm payment (authenticated)
- Method: `POST`
- URL: `{{baseUrl}}/api/funding/confirm`
- Headers:
  - `Authorization: Bearer {{authToken}}`
- Body example:
```json
{ "paymentIntentId": "pi_1234567890" }
```
- Expected: funding record.

### 8.4 Get funding stats (admin only)
- Method: `GET`
- URL: `{{baseUrl}}/api/funding/stats`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Expected: funding analytics.

## 9. Statistics APIs

> These endpoints are under `/api/stats`.

### 9.1 Public stats
- Method: `GET`
- URL: `{{baseUrl}}/api/stats/public`
- Expected:
```json
{
  "success": true,
  "verifiedIncidents": 10,
  "activeLostFound": 5,
  "totalUsers": 42
}
```

### 9.2 Admin stats
- Method: `GET`
- URL: `{{baseUrl}}/api/stats/admin`
- Headers:
  - `Authorization: Bearer {{adminToken}}`
- Expected: aggregated admin dashboard statistics.

## 10. Recommended Postman Workflow

1. Create a new collection: `LocalGuard API`
2. Create environment: `LocalGuard Dev`
3. Add `baseUrl` and `authToken` variables.
4. Add requests in the order below:
   - Register
   - Login
   - Get profile
   - Create normal user content
   - Create admin user content
   - Admin-only management endpoints
5. Use `Tests` scripts to save IDs and tokens automatically:
   - After login: save `authToken`
   - After creating a user or record: save `userId`, `incidentId`, `postId`, etc.

## 11. Suggested Postman Tests

- `Status code is 200` for successful GET/PATCH/DELETE calls.
- `Content-Type` contains `application/json`.
- Response body contains `success: true`.
- For login/register, token should be present.
- For protected endpoints, missing or invalid token should return `401`.
- For admin-only endpoints, non-admin token should return `403`.

## 12. Notes

- Use `Authorization: Bearer {{authToken}}` for regular authenticated requests.
- Use `Authorization: Bearer {{adminToken}}` for admin-only requests.
- If you need an admin user, create one in the database or promote a normal user via `PATCH /api/users/{{userId}}/role`.
- The `autoModerate` helper is not an API endpoint; it is meant for scheduled background tasks.

---

This document covers all project API routes currently implemented in LocalGuard. Use it as your Postman test plan for manual API verification and regression testing.
