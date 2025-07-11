# WebRTC Group Calling Application Requirements

## Step 1: User Management and Status Tracking

### User Registration and Storage
1. MongoDB User Collection
   - User Schema:
     - Email (unique identifier)
     - Registration timestamp
     - Current status (online/offline)
     - Last active timestamp

2. Registration Flow
   - When a new user logs in for the first time:
     - Create a new user document in MongoDB
     - Set initial status as online
   - When an existing user logs in:
     - Update status to online
     - Update last active timestamp
     - No new document creation

### Real-time Status Management
1. User Login
   - Check if user exists in MongoDB
   - If new user:
     - Create user record
   - If existing user:
     - Update status to online
   - Broadcast status change event via Socket.IO:
     - All connected clients receive update
     - Other online users update their UI
   - Example:
     - Alice and Sai online
     - Bob logs in
     - Both Alice and Sai get notification
     - Their user lists update to show Bob online

2. User Disconnection
   - Triggered by:
     - Manual logout
     - Connection loss
     - Browser close
     - Page refresh
   - Actions:
     - Update user status to offline in MongoDB
     - Update last active timestamp
     - Broadcast offline status event via Socket.IO
   - Example:
     - Alice, Bob, and Sai online
     - Bob disconnects
     - Update Bob's status to offline
     - Alice and Sai receive event
     - Their lists update to show Bob offline

3. Status Synchronization
   - On user login:
     - Fetch all registered users from MongoDB using unified API:
       - `GET /api/users` (optionally with query params for filtering)
     - Display with current online/offline status
   - Real-time updates:
     - Socket.IO events for status changes
     - Immediate UI updates
   - Consistent status across all users

4. Unified User and Group APIs
   - All user and group fetches are handled by unified endpoints:
     - `GET /api/users` (all users, with optional query params)
     - `GET /api/groups` (all groups, groups for a user, or pending invites, using query params)
       - Examples:
         - All groups: `GET /api/groups`
         - Groups for a user: `GET /api/groups?userEmail=bob@example.com`
         - Pending invites: `GET /api/groups?userEmail=bob@example.com&status=pending`
   - All group member actions (accept, decline, add, remove) use a single endpoint:
     - `PATCH /api/groups/:groupId/member` with an `action` and relevant payload
   - All real-time group and user status changes are broadcast via Socket.IO

5. Simplicity and Maintainability
   - Minimal, unified API surface for all user and group operations
   - All status and group changes are handled with clear, single-purpose endpoints
   - Frontend and backend are kept in sync with real-time events and simple fetches

## Step 2: Group Call Initiation and Management

### Call Initiation Interface
1. Header Controls
   - "Start Group Call" button in header
   - Popover with online users list on button click
   - Multi-user selection capability
   - Confirmation button (OK) to start call

2. User Selection
   - Display all online users except current user
   - Allow multiple user selection
   - Example:
     - Alice sees: Bob, Sai, Dob
     - Can select any combination of users

### Call Flow
1. Call Initiation
   - Room creation for selected users
   - Call initiated by caller
   - Notification sent to selected users

2. Call Reception
   - Caller View (e.g., Alice):
     - "Calling..." status display
   - Recipients View (e.g., Bob, Sai):
     - "Call Ringing" notification
     - Accept button
     - Decline button

3. Group Call Formation
   - Automatic room creation upon acceptance
   - Participants include:
     - Call initiator
     - All users who accepted
   - Immediate call start after acceptance

### Call Availability Check
1. User Status Tracking
   - Track users currently in active calls
   - Maintain real-time call status for each user

2. Call Initiation Prevention
   - Example Scenario:
     - Alice and Sai are in an active call
     - Dob attempts to start call with Alice and Sai
     - System checks call status of selected users
     - Dob receives notification: "Selected users (Alice, Sai) are currently in another call"
   - Prevents multiple call conflicts
   - Ensures clear user availability status

### Call Ending Scenarios
1. Host Privileges
   - Call initiator (host) has special privileges
   - Example:
     - Alice (host) starts call with Bob and Sai
     - When Alice ends call:
       - All participants (Bob and Sai) automatically exit
       - Room is terminated
       - All connections closed

2. Participant Exit
   - Non-host participants can leave individually
   - Example:
     - In Alice's call with Bob and Sai
     - If Sai ends call:
       - Only Sai exits
       - Alice and Bob continue call
       - Call remains active for remaining participants
   - No impact on other participants' connections

### Rejoin Functionality
1. Voluntary Exit Handling
   - Applies when participant chooses to leave call
   - Does not apply to:
     - Logout
     - Page refresh
     - Browser close
     - Host ending call

2. Dashboard Update
   - After voluntary exit:
     - User returns to dashboard
     - System checks if previous call still active
     - If active, show "Join Existing Meeting" button
   - Example Scenario:
     - Alice (host), Bob, and Sai in call
     - Bob clicks "Leave" and exits
     - Bob sees dashboard with "Join Existing Meeting" button
     - Bob can click to rejoin Alice and Sai
     - Original call continues uninterrupted

3. Rejoin Process
   - Clicking "Join Existing Meeting":
     - Reconnects to original room
     - Restores video/audio streams
     - Other participants notified of rejoin
   - Seamless reintegration into existing call

## Step 3: Development Approach

### UI Guidelines
1. Preserve Existing UI
   - Maintain current UI structure
   - Keep existing CSS intact
   - Minimal UI modifications only when absolutely necessary
   - Any changes should be non-intrusive

2. Required UI Additions
   - Only add UI elements for new functionality
   - Examples:
     - Group call button in header
     - User selection popover
     - Call status indicators
   - Maintain existing design patterns

### Code Implementation
1. Simplification Principles
   - Write clear, straightforward code
   - Avoid complex abstractions
   - Use simple, understandable variable names
   - Add comments explaining functionality
   - Focus on readability over optimization

2. Learning-Friendly Approach
   - Break down complex operations into simple steps
   - Document each major function's purpose
   - Use basic JavaScript patterns
   - Minimize use of advanced features unless necessary
   - Keep logic easy to follow and debug 

## Step 4: Meeting Analytics and Storage

### MongoDB Integration
1. Database Schema
   - Meetings Collection:
     - Meeting ID
     - Host email
     - Start timestamp
     - End timestamp
     - Status (active/completed)
   
   - Participant Activity Collection:
     - Meeting ID
     - Participant email
     - Join timestamp
     - Exit timestamp
     - Rejoin events
     - Total duration
     - Connection status

2. Event Tracking
   - Record meeting creation
   - Track participant actions:
     - Initial join
     - Voluntary exits
     - Rejoin events
     - Final exit
   - Calculate duration metrics
   - Store connection status changes

### Analytics Display
1. Host Dashboard
   - Show analytics section for meeting hosts
   - Display list of all hosted meetings
   - For each meeting:
     - Date and time
     - Total duration
     - Number of participants
     - Participant list with details

2. Meeting Details View
   - Detailed view per meeting:
     - Complete participant history
     - Individual timelines:
       - When each person joined
       - When they left
       - If/when they rejoined
     - Total time spent per participant
   - Example:
     - Alice hosted meeting with Bob and Sai
     - Can see Bob left at 10:30 AM
     - Bob rejoined at 10:45 AM
     - Sai stayed entire duration
     - Total duration for each participant

3. API Integration
   - Endpoint for fetching host's meeting history
   - Endpoint for detailed meeting analytics
   - Real-time updates during active meetings
   - Historical data for completed meetings

4. Data Persistence
   - Store all meeting data permanently
   - Allow historical access
   - Maintain participant privacy
   - Secure access to analytics
   - Only host can view their meeting details 