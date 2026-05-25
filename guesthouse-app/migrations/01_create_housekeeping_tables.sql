-- profiles already has a role column; ensure values include 'housekeeper'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text;

-- Table for housekeeping tasks
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id uuid REFERENCES rooms(id),
    housekeeper_id uuid REFERENCES profiles(id),
    status text CHECK (status IN ('pending','in_progress','completed')) DEFAULT 'pending',
    notes text,
    updated_at timestamp DEFAULT now()
);

-- Table for permanent QR login tokens
CREATE TABLE IF NOT EXISTS housekeeping_logins (
    token uuid PRIMARY KEY,
    housekeeper_id uuid REFERENCES profiles(id),
    created_at timestamp DEFAULT now()
);

-- Row Level Security (RLS) policies for housekeepers
ALTER TABLE housekeeping_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY housekeeping_task_select ON housekeeping_tasks
    FOR SELECT USING (auth.role() = 'housekeeper' AND housekeeper_id = auth.uid());
CREATE POLICY housekeeping_task_insert ON housekeeping_tasks
    FOR INSERT WITH CHECK (auth.role() = 'housekeeper' AND housekeeper_id = auth.uid());
CREATE POLICY housekeeping_task_update ON housekeeping_tasks
    FOR UPDATE USING (auth.role() = 'housekeeper' AND housekeeper_id = auth.uid())
    WITH CHECK (auth.role() = 'housekeeper' AND housekeeper_id = auth.uid());
