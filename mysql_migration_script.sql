-- ============================================================
-- SCRIPT DE MIGRAÇÃO COMPLETO: PostgreSQL (Supabase) → MySQL (AWS RDS)
-- Projeto: Painel de Gestão de Chamados
-- Gerado em: 2026-02-23
-- Compatível com: MySQL 8.0+ / Amazon RDS MySQL / Aurora MySQL
-- ============================================================

-- Criar o banco de dados
CREATE DATABASE IF NOT EXISTS painel_chamados
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE painel_chamados;

-- ============================================================
-- TABELA: profiles
-- Dados adicionais do usuário (equivalente ao auth.users do Supabase)
-- ============================================================
CREATE TABLE profiles (
  id CHAR(36) NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ENUM simulado via tabela de referência (app_role)
-- MySQL não suporta CREATE TYPE, usamos ENUM inline
-- ============================================================

-- ============================================================
-- TABELA: user_roles
-- Papéis dos usuários: supervisor, analyst, backoffice
-- ============================================================
CREATE TABLE user_roles (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  role ENUM('supervisor', 'analyst', 'backoffice') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_roles_user_role (user_id, role),
  INDEX idx_user_roles_user_id (user_id),
  INDEX idx_user_roles_role (role),
  CONSTRAINT fk_user_roles_profile FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: requesters
-- Solicitantes cadastrados pelo supervisor
-- ============================================================
CREATE TABLE requesters (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_requesters_active (active),
  CONSTRAINT fk_requesters_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: ticket_types
-- Tipos de solicitação dinâmicos
-- ============================================================
CREATE TABLE ticket_types (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  label TEXT NOT NULL,
  value VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ticket_types_value (value),
  INDEX idx_ticket_types_active (active),
  CONSTRAINT fk_ticket_types_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: tickets
-- Chamados principais com controle de tempo
-- ============================================================
CREATE TABLE tickets (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  base_name TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_user_id CHAR(36) DEFAULT NULL,
  priority VARCHAR(50) NOT NULL COMMENT 'baixa, media, alta, urgente',
  type VARCHAR(255) NOT NULL COMMENT 'Referência ao value de ticket_types',
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'nao_iniciado' COMMENT 'nao_iniciado, em_andamento, pausado, finalizado',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL DEFAULT NULL,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  total_execution_seconds INT NOT NULL DEFAULT 0,
  total_paused_seconds INT NOT NULL DEFAULT 0,
  assigned_analyst_id CHAR(36) DEFAULT NULL,
  pause_started_at TIMESTAMP NULL DEFAULT NULL,
  attachment_url TEXT DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_priority (priority),
  INDEX idx_tickets_assigned (assigned_analyst_id),
  INDEX idx_tickets_requester_user (requester_user_id),
  INDEX idx_tickets_created_at (created_at),
  INDEX idx_tickets_type (type),
  CONSTRAINT fk_tickets_requester_user FOREIGN KEY (requester_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_analyst FOREIGN KEY (assigned_analyst_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: ticket_status_logs
-- Histórico de mudanças de status dos chamados
-- ============================================================
CREATE TABLE ticket_status_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  ticket_id CHAR(36) NOT NULL,
  changed_by CHAR(36) NOT NULL,
  old_status VARCHAR(50) NOT NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_status_logs_ticket (ticket_id),
  INDEX idx_status_logs_changed_at (changed_at),
  CONSTRAINT fk_status_logs_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: pause_reasons
-- Motivos de pausa configuráveis pelo supervisor
-- ============================================================
CREATE TABLE pause_reasons (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  title TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pause_reasons_active (active),
  CONSTRAINT fk_pause_reasons_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: pause_logs
-- Registro de cada pausa em um chamado
-- ============================================================
CREATE TABLE pause_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  ticket_id CHAR(36) NOT NULL,
  pause_reason_id CHAR(36) NOT NULL,
  description_text TEXT DEFAULT NULL,
  pause_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  pause_ended_at TIMESTAMP NULL DEFAULT NULL,
  paused_seconds INT NOT NULL DEFAULT 0,
  created_by CHAR(36) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_pause_logs_ticket (ticket_id),
  INDEX idx_pause_logs_reason (pause_reason_id),
  CONSTRAINT fk_pause_logs_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_pause_logs_reason FOREIGN KEY (pause_reason_id) REFERENCES pause_reasons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: pause_evidences
-- Arquivos de evidência anexados a uma pausa
-- ============================================================
CREATE TABLE pause_evidences (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  ticket_id CHAR(36) NOT NULL,
  pause_log_id CHAR(36) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pause_evidences_ticket (ticket_id),
  INDEX idx_pause_evidences_log (pause_log_id),
  CONSTRAINT fk_pause_evidences_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_pause_evidences_log FOREIGN KEY (pause_log_id) REFERENCES pause_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: pause_responses
-- Respostas a uma pendência/pausa
-- ============================================================
CREATE TABLE pause_responses (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  pause_log_id CHAR(36) NOT NULL,
  ticket_id CHAR(36) NOT NULL,
  description_text TEXT NOT NULL,
  responded_by CHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pause_responses_log (pause_log_id),
  INDEX idx_pause_responses_ticket (ticket_id),
  CONSTRAINT fk_pause_responses_log FOREIGN KEY (pause_log_id) REFERENCES pause_logs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pause_responses_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: pause_response_files
-- Arquivos anexados a respostas de pausa
-- ============================================================
CREATE TABLE pause_response_files (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  pause_response_id CHAR(36) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by CHAR(36) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_pause_response_files_response (pause_response_id),
  CONSTRAINT fk_pause_response_files_response FOREIGN KEY (pause_response_id) REFERENCES pause_responses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABELA: assignment_control
-- Controle de rodízio (round-robin) para atribuição automática
-- ============================================================
CREATE TABLE assignment_control (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  last_assigned_user_id CHAR(36) DEFAULT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inserir registro inicial de controle
INSERT INTO assignment_control (id) VALUES (UUID());

-- ============================================================
-- DADOS INICIAIS: ticket_types (tipos padrão)
-- Nota: created_by precisa de um user_id válido. Use o ID do admin.
-- ============================================================
-- INSERT INTO ticket_types (label, value, created_by) VALUES
--   ('Setup Questionário', 'setup_questionario', '<ADMIN_USER_ID>'),
--   ('Cliente', 'cliente', '<ADMIN_USER_ID>'),
--   ('Ajuste', 'ajuste', '<ADMIN_USER_ID>'),
--   ('Outro', 'outro', '<ADMIN_USER_ID>');

-- ============================================================
-- FUNÇÃO: has_role (equivalente à security definer do PostgreSQL)
-- Verifica se um usuário tem determinado papel
-- ============================================================
DELIMITER //

CREATE FUNCTION has_role(
  p_user_id CHAR(36),
  p_role VARCHAR(20)
)
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_exists BOOLEAN DEFAULT FALSE;
  SELECT EXISTS(
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id AND role = p_role
  ) INTO v_exists;
  RETURN v_exists;
END //

DELIMITER ;

-- ============================================================
-- FUNÇÃO: get_user_role
-- Retorna o papel de um usuário
-- ============================================================
DELIMITER //

CREATE FUNCTION get_user_role(
  p_user_id CHAR(36)
)
RETURNS VARCHAR(20)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_role VARCHAR(20) DEFAULT NULL;
  SELECT role INTO v_role FROM user_roles
  WHERE user_id = p_user_id LIMIT 1;
  RETURN v_role;
END //

DELIMITER ;

-- ============================================================
-- TRIGGER: auto_assign_ticket
-- Atribuição automática round-robin ao inserir novo ticket
-- ============================================================
DELIMITER //

CREATE TRIGGER trg_auto_assign_ticket
AFTER INSERT ON tickets
FOR EACH ROW
BEGIN
  DECLARE v_next_analyst CHAR(36);
  DECLARE v_last_assigned CHAR(36);
  DECLARE v_control_id CHAR(36);
  DECLARE v_count INT DEFAULT 0;
  DECLARE v_idx INT DEFAULT 0;
  DECLARE v_found INT DEFAULT 0;
  DECLARE v_first_analyst CHAR(36);

  -- Contar analistas backoffice
  SELECT COUNT(*) INTO v_count
  FROM user_roles WHERE role = 'backoffice';

  IF v_count = 0 THEN
    -- Sem backoffice, não faz nada
    SIGNAL SQLSTATE '01000' SET MESSAGE_TEXT = 'Nenhum backoffice disponível';
  END IF;

  -- Buscar controle de atribuição
  SELECT id, last_assigned_user_id INTO v_control_id, v_last_assigned
  FROM assignment_control LIMIT 1;

  IF v_last_assigned IS NULL THEN
    -- Primeiro da lista
    SELECT user_id INTO v_next_analyst
    FROM user_roles WHERE role = 'backoffice'
    ORDER BY user_id LIMIT 1;
  ELSE
    -- Próximo após o último atribuído
    SELECT user_id INTO v_next_analyst
    FROM user_roles WHERE role = 'backoffice' AND user_id > v_last_assigned
    ORDER BY user_id LIMIT 1;

    IF v_next_analyst IS NULL THEN
      -- Voltou ao início (round-robin)
      SELECT user_id INTO v_next_analyst
      FROM user_roles WHERE role = 'backoffice'
      ORDER BY user_id LIMIT 1;
    END IF;
  END IF;

  IF v_next_analyst IS NOT NULL THEN
    UPDATE tickets
    SET assigned_analyst_id = v_next_analyst,
        status = 'em_andamento',
        started_at = NOW()
    WHERE id = NEW.id;

    UPDATE assignment_control
    SET last_assigned_user_id = v_next_analyst,
        updated_at = NOW()
    WHERE id = v_control_id;
  END IF;
END //

DELIMITER ;

-- ============================================================
-- TRIGGER: handle_new_user
-- Cria perfil automaticamente ao inserir usuário
-- (Em MySQL, você precisará chamar isso da sua aplicação
--  já que não há tabela auth.users gerenciada pelo Supabase)
-- ============================================================
-- Nota: No MySQL/AWS RDS, a autenticação é feita na camada da aplicação.
-- Ao criar um usuário, insira manualmente na tabela profiles:
--   INSERT INTO profiles (id, name) VALUES ('<user_uuid>', '<user_name>');
--   INSERT INTO user_roles (user_id, role) VALUES ('<user_uuid>', 'analyst');

-- ============================================================
-- STORED PROCEDURE: create_user
-- Helper para criar usuário com perfil e role de uma vez
-- ============================================================
DELIMITER //

CREATE PROCEDURE create_user(
  IN p_user_id CHAR(36),
  IN p_name TEXT,
  IN p_role VARCHAR(20)
)
BEGIN
  INSERT INTO profiles (id, name) VALUES (p_user_id, p_name);
  INSERT INTO user_roles (user_id, role) VALUES (p_user_id, p_role);
END //

DELIMITER ;

-- ============================================================
-- STORED PROCEDURE: pause_ticket
-- Pausar um chamado com motivo
-- ============================================================
DELIMITER //

CREATE PROCEDURE pause_ticket(
  IN p_ticket_id CHAR(36),
  IN p_pause_reason_id CHAR(36),
  IN p_description TEXT,
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);
  DECLARE v_now TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

  SELECT status INTO v_old_status FROM tickets WHERE id = p_ticket_id;

  IF v_old_status != 'em_andamento' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não está em andamento';
  END IF;

  -- Atualizar ticket
  UPDATE tickets
  SET status = 'pausado',
      pause_started_at = v_now
  WHERE id = p_ticket_id;

  -- Criar log de pausa
  INSERT INTO pause_logs (ticket_id, pause_reason_id, description_text, pause_started_at, created_by)
  VALUES (p_ticket_id, p_pause_reason_id, p_description, v_now, p_user_id);

  -- Registrar mudança de status
  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, v_old_status, 'pausado');
END //

DELIMITER ;

-- ============================================================
-- STORED PROCEDURE: resume_ticket
-- Retomar um chamado pausado
-- ============================================================
DELIMITER //

CREATE PROCEDURE resume_ticket(
  IN p_ticket_id CHAR(36),
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);
  DECLARE v_pause_start TIMESTAMP;
  DECLARE v_paused_secs INT;
  DECLARE v_pause_log_id CHAR(36);

  SELECT status, pause_started_at INTO v_old_status, v_pause_start
  FROM tickets WHERE id = p_ticket_id;

  IF v_old_status != 'pausado' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não está pausado';
  END IF;

  SET v_paused_secs = TIMESTAMPDIFF(SECOND, v_pause_start, CURRENT_TIMESTAMP);

  -- Atualizar ticket
  UPDATE tickets
  SET status = 'em_andamento',
      pause_started_at = NULL,
      total_paused_seconds = total_paused_seconds + v_paused_secs
  WHERE id = p_ticket_id;

  -- Fechar o pause_log aberto
  SELECT id INTO v_pause_log_id
  FROM pause_logs
  WHERE ticket_id = p_ticket_id AND pause_ended_at IS NULL
  ORDER BY pause_started_at DESC LIMIT 1;

  IF v_pause_log_id IS NOT NULL THEN
    UPDATE pause_logs
    SET pause_ended_at = CURRENT_TIMESTAMP,
        paused_seconds = v_paused_secs
    WHERE id = v_pause_log_id;
  END IF;

  -- Registrar mudança de status
  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, 'pausado', 'em_andamento');
END //

DELIMITER ;

-- ============================================================
-- STORED PROCEDURE: finish_ticket
-- Finalizar um chamado
-- ============================================================
DELIMITER //

CREATE PROCEDURE finish_ticket(
  IN p_ticket_id CHAR(36),
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);
  DECLARE v_started TIMESTAMP;
  DECLARE v_exec_secs INT;

  SELECT status, started_at INTO v_old_status, v_started
  FROM tickets WHERE id = p_ticket_id;

  IF v_old_status = 'finalizado' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket já finalizado';
  END IF;

  SET v_exec_secs = TIMESTAMPDIFF(SECOND, v_started, CURRENT_TIMESTAMP);

  UPDATE tickets
  SET status = 'finalizado',
      finished_at = CURRENT_TIMESTAMP,
      total_execution_seconds = v_exec_secs
  WHERE id = p_ticket_id;

  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, v_old_status, 'finalizado');
END //

DELIMITER ;

-- ============================================================
-- VIEW: tickets_with_analyst
-- Visão de chamados com nome do analista atribuído
-- ============================================================
CREATE VIEW tickets_with_analyst AS
SELECT
  t.*,
  p.name AS analyst_name
FROM tickets t
LEFT JOIN profiles p ON t.assigned_analyst_id = p.id;

-- ============================================================
-- VIEW: tickets_with_requester
-- Visão de chamados com nome do solicitante (profile)
-- ============================================================
CREATE VIEW tickets_with_requester AS
SELECT
  t.*,
  p.name AS requester_profile_name
FROM tickets t
LEFT JOIN profiles p ON t.requester_user_id = p.id;

-- ============================================================
-- VIEW: pause_logs_with_reason
-- Pausas com o título do motivo
-- ============================================================
CREATE VIEW pause_logs_with_reason AS
SELECT
  pl.*,
  pr.title AS reason_title
FROM pause_logs pl
JOIN pause_reasons pr ON pl.pause_reason_id = pr.id;

-- ============================================================
-- NOTAS IMPORTANTES PARA MIGRAÇÃO
-- ============================================================
-- 
-- 1. AUTENTICAÇÃO:
--    - O Supabase gerencia auth.users internamente.
--    - No MySQL/AWS RDS, você precisa implementar autenticação
--      na camada da aplicação (ex: JWT, Cognito, Auth0).
--    - Use a procedure create_user() para registrar novos usuários.
--
-- 2. ROW LEVEL SECURITY (RLS):
--    - MySQL NÃO suporta RLS nativamente.
--    - Toda a lógica de permissão deve ser implementada na API/backend.
--    - Use a função has_role() nas queries da aplicação para filtrar dados.
--    - Exemplo: SELECT * FROM tickets WHERE has_role(@current_user_id, 'supervisor')
--              OR assigned_analyst_id = @current_user_id;
--
-- 3. STORAGE (Arquivos):
--    - O Supabase Storage não existe no MySQL.
--    - Use Amazon S3 para armazenar arquivos (pause_evidences, attachments).
--    - As colunas file_url e attachment_url devem apontar para URLs do S3.
--
-- 4. UUID:
--    - MySQL 8.0+ suporta UUID() nativamente.
--    - As PKs usam CHAR(36) para compatibilidade.
--    - Para melhor performance, considere BINARY(16) com UUID_TO_BIN().
--
-- 5. TIMESTAMPS:
--    - MySQL TIMESTAMP tem range até 2038-01-19.
--    - Para datas futuras, considere DATETIME.
--    - O script usa TIMESTAMP por compatibilidade com o schema original.
--
-- 6. EDGE FUNCTIONS:
--    - bulk-import-tickets, create-public-ticket, manage-users
--    - Devem ser reimplementadas como AWS Lambda ou API endpoints.
--
-- 7. REALTIME:
--    - Supabase Realtime não existe no MySQL.
--    - Use WebSockets (AWS API Gateway + Lambda) ou polling.
--
-- ============================================================
