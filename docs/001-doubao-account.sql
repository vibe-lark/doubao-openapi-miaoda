CREATE TABLE IF NOT EXISTS doubao_account (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner user_profile NOT NULL,
 encrypted_token text,
 auth_state_hash varchar(64),
 auth_status varchar(32) NOT NULL DEFAULT 'idle',
 auth_expires_at bigint NOT NULL DEFAULT 0,
 refresh_lock_until bigint NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 0,
 _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 _created_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END),
 _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 _updated_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END)
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_doubao_account_owner ON doubao_account (((owner).user_id));
ALTER TABLE doubao_account ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON doubao_account TO service_role USING (true);
CREATE POLICY "修改全部数据" ON doubao_account AS PERMISSIVE FOR ALL TO authenticated USING (false);
CREATE POLICY "查看全部数据" ON doubao_account AS PERMISSIVE FOR SELECT TO authenticated, anon USING (false);
CREATE POLICY "修改本人数据" ON doubao_account AS PERMISSIVE FOR ALL TO authenticated USING ((owner).user_id = current_setting('app.user_id', TRUE)) WITH CHECK ((owner).user_id = current_setting('app.user_id', TRUE));
COMMENT ON TABLE doubao_account IS '仅服务端访问的用户授权记录；凭据使用 AES-256-GCM 加密，不通过 Dataloom 暴露';
