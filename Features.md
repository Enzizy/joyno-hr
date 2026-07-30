SERVICES PAGE
Page Purpose
Track and manage services being delivered to clients. Services are created automatically when you add a client or convert a lead.

No "Add Service" Button
Services are NOT created manually here. They are created:

When you convert a lead to client (with selected services)
When you add a new client (with selected services)
Search & Filters
Filter	Options
Search	Searches by client company name
Type Filter	All Types, Social Media, Website Dev
Client Filter	All Clients, or specific client name
URL Parameter Support: If you navigate from Clients page via "View Services", it auto-sets the client filter from ?client={id}

Service Cards Display
For Social Media Management services:
Pink icon (Share2)
Service type name
Client company name
Status badge (Not Started, In Progress, Active, Completed, Paused)
Platforms list (Instagram, Facebook, Twitter, LinkedIn, TikTok, YouTube badges)
Assigned Team (employee usernames)
For Website Development services:
Blue icon (Globe)
Service type name
Client company name
Status badge
Website URL (clickable link with external icon)
Progress bar (0-100%)
Assigned Team
"Manage Service" Button
Each card has a "Manage Service" button that opens a slide-out form.

Service Form Fields:
Field	Type	Description
Status	Dropdown	Not Started, In Progress, Active, Completed, Paused
Assigned Employees	Checkboxes	Select team members (lists all users)
Platforms	Checkboxes	Only for Social Media: Instagram, Facebook, Twitter, LinkedIn, TikTok, YouTube
Website URL	Text	Only for Website Dev: The live URL
Progress	Slider	Only for Website Dev: 0-100% slider
Notes	Text area	Any additional notes
Click "Update Service" to save changes.

TASKS PAGE
Page Purpose
Central hub for managing all work items assigned to employees.

1. "Create Task" Button
Opens a slide-out form to create new tasks.

Task Form Fields:
Field	Type	Required	Description
Task Title	Text	✅ Yes	Name of the task
Description	Text area	No	Details about the task
Client	Dropdown	No	Select from active clients (or "No client")
Service	Dropdown	No	Appears only if client selected - Select client's services
Assign To	Dropdown	✅ Yes	Select employee to assign
Priority	Dropdown	No	Low, Medium, High, Urgent (default: Medium)
Status	Dropdown	No	Pending, In Progress, Completed, Cancelled (default: Pending)
Due Date	Date	✅ Yes	When task is due
What happens on create:

Creates Task record
Creates Notification for assigned employee ("New Task Assigned: {title}")
2. Status Tabs
Quick filter tabs at top:

Active (default): Shows Pending + In Progress tasks
Overdue: Shows uncompleted tasks past due date
Completed: Shows completed tasks only
All: Shows everything
3. Search & Filters
Filter	Options
Search	Searches task titles
Client Filter	All Clients, or specific client
Employee Filter	All Employees, or specific person
URL Parameter: Supports ?client={id} from Clients page "View Tasks" link

4. Task Cards Display
Each task card shows:

Title (with ⚡ icon if automated)
Description (2-line preview)
Due Date with color coding:
🔴 Red = Overdue (card has red border/background)
🟡 Yellow = Due Today (card has yellow border/background)
⚪ Normal = Future date
Client name (if linked)
Assigned user (username portion of email)
Priority badge (Low, Medium, High, Urgent)
Status badge (Pending, In Progress, Completed, Cancelled)
5. Task Card Three-Dot Menu (⋯)
For Pending Tasks:
Action	What it does
Start Task	Changes status from Pending → In Progress
Mark Complete	Opens Complete Task Dialog
Edit Task	Opens Task Form (Admin only)
Cancel Task	Changes status to Cancelled (Admin only)
For In Progress Tasks:
Action	What it does
Mark Complete	Opens Complete Task Dialog
Edit Task	Opens Task Form (Admin only)
Cancel Task	Changes status to Cancelled (Admin only)
For Completed Tasks:
Action	What it does
Edit Task	Opens Task Form (Admin only)
6. Complete Task Dialog
When you click "Mark Complete", a popup appears:

Field	Type	Required	Description
Completion Notes	Text area	No	Notes about what was done
Proof of Work	File upload	No	Screenshot, document, etc.
What happens on complete:

Sets status = "completed"
Sets completed_date = now
Saves completion_notes
Saves proof_of_work_url (if file uploaded)
AUTOMATION PAGE
Page Purpose
Create rules that automatically generate recurring tasks for clients.

Info Card
Yellow banner explains:

"Automation rules create tasks automatically based on your schedule. For example, create a rule to generate daily 'Post to Instagram' tasks for a client. Rules automatically stop when the client's contract ends."

1. "Create Rule" Button
Opens a slide-out form to create automation rules.

Automation Form Fields:
Field	Type	Required	Description
Rule Name	Text	✅ Yes	Descriptive name (e.g., "Daily Instagram Posts for ABC Corp")
Client	Dropdown	✅ Yes	Select active client
Service	Dropdown	No	Appears if client selected - Link to specific service
Task Title Template	Text	✅ Yes	What generated tasks will be named (e.g., "Post to Instagram")
Task Description Template	Text area	No	Description for each generated task
Assign To	Dropdown	✅ Yes	Employee who gets the tasks
Priority	Dropdown	No	Low, Medium, High, Urgent
Schedule	Dropdown	No	Daily, Weekdays Only, Custom Days
Custom Days	Checkboxes	No	Only if Schedule = Custom: Mon, Tue, Wed, Thu, Fri, Sat, Sun
Start Date	Date	No	When to start generating
End Date	Date	No	Auto-fills from client's contract end date
Active Toggle	Switch	No	Enable/disable task generation
2. Automation Rule Cards Display
Each rule card shows:

Rule Name
Task title template (in quotes)
Client name
Assigned employee (username)
Schedule (Daily, Weekdays, or abbreviated days like "Mon, Wed, Fri")
Status badge: Active (green) / Paused (gray) / Expired (gray + "Expired")
End date badge ("Ends Dec 31, 2026")
3. Active/Paused Toggle
Switch on each card to enable/disable the rule without deleting it.

Disabled if rule is expired (past end date)
4. Three-Dot Menu (⋯)
Action	What it does
Edit Rule	Opens Automation Form with all data pre-filled
Run Now	Immediately creates a task from this rule (even if paused)
Delete	Opens confirmation dialog, then deletes rule
"Run Now" Function:
When clicked:

Creates a Task with:
title = task_title_template
description = task_description_template
client_id from rule
service_id from rule (if set)
assigned_to from rule
priority from rule
status = "pending"
due_date = today
is_automated = true
automation_rule_id = this rule's ID
Creates a Notification for the assigned employee
Shows alert: "Task created successfully!"
5. Delete Confirmation Dialog
When you click Delete:

Title: "Delete Automation Rule"
Message: "Are you sure you want to delete '{rule name}'? This action cannot be undone. Existing tasks created by this rule will not be affected."
Buttons: Cancel / Delete (red)
Auto-Fill End Date Feature
When you select a client in the form:

The End Date field automatically fills with that client's contract_end_date
This ensures automation stops when the contract expires
Visual States
Rule State	Card Appearance
Active	Normal, amber icon, green "Active" badge
Paused	Normal, gray icon, gray "Paused" badge, switch OFF
Expired	60% opacity, gray icon, "Expired" badge, switch disabled
How Automation Actually Works
The rules define WHAT tasks to create and WHEN. The actual task generation would typically happen via:

A scheduled backend job that runs daily
Checks each active, non-expired rule
Creates tasks based on schedule_type:
Daily: Creates task every day
Weekdays: Creates task Mon-Fri only
Custom: Creates task only on selected days
Note: The "Run Now" button lets you manually trigger a task creation immediately.