-- ============================================================
-- MIGRAÇÃO COMPLETA: PostgreSQL (Supabase) → MySQL 8.0+ (AWS RDS)
-- Projeto: Painel de Gestão de Chamados
-- Atualizado em: 2026-02-25
-- Compatível com: MySQL 8.0+ / Amazon RDS MySQL / Aurora MySQL
-- 
-- INSTRUÇÕES:
-- 1. Execute este script inteiro em um MySQL 8.0+
-- 2. Todas as nomenclaturas são idênticas ao banco PostgreSQL original
-- 3. UUIDs são armazenados como CHAR(36) para legibilidade
-- 4. Timestamps usam DATETIME(6) para microsegundos (equivale a timestamptz)
-- 5. RLS foi convertido em stored procedures/functions de validação
-- 6. Storage policies foram documentadas para implementação com S3
-- 7. Tabelas setup_levels e teams incluídas (adicionadas ao sistema)
-- 8. Campos setup_level e team na tabela tickets incluídos
-- ============================================================

SET NAMES utf8mb4;
SET CHARACTER_SET_CLIENT = utf8mb4;
SET CHARACTER_SET_CONNECTION = utf8mb4;
SET CHARACTER_SET_RESULTS = utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

-- ============================================================
-- 1. CRIAR BANCO DE DADOS
-- ============================================================
CREATE DATABASE IF NOT EXISTS painel_chamados
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE painel_chamados;

-- ============================================================
-- 2. TABELAS
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 profiles
-- Perfil do usuário (substitui auth.users do Supabase)
-- Colunas: id, name, created_at
-- ------------------------------------------------------------
CREATE TABLE profiles (
  id CHAR(36) NOT NULL COMMENT 'UUID do usuário, gerado pela aplicação ou auth provider',
  name TEXT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Perfis de usuários do sistema';

-- ------------------------------------------------------------
-- 2.2 user_roles
-- Papéis: supervisor, analyst, backoffice
-- Colunas: id, user_id, role
-- Constraint: UNIQUE(user_id, role)
-- ------------------------------------------------------------
CREATE TABLE user_roles (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  role ENUM('supervisor','analyst','backoffice') NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY user_roles_user_id_role_key (user_id, role),
  CONSTRAINT fk_user_roles_user_id FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Papéis dos usuários (supervisor, analyst, backoffice)';

-- ------------------------------------------------------------
-- 2.3 requesters
-- Solicitantes cadastrados
-- Colunas: id, name, active, created_by, created_at
-- ------------------------------------------------------------
CREATE TABLE requesters (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  name TEXT NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT fk_requesters_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Solicitantes de chamados';

-- ------------------------------------------------------------
-- 2.4 ticket_types
-- Tipos de solicitação dinâmicos
-- Colunas: id, label, value (UNIQUE), description, active, created_by, created_at
-- ------------------------------------------------------------
CREATE TABLE ticket_types (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  label TEXT NOT NULL,
  value VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY ticket_types_value_key (value),
  CONSTRAINT fk_ticket_types_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Tipos de solicitação configuráveis';

-- ------------------------------------------------------------
-- 2.5 setup_levels
-- Níveis de setup configuráveis pelo supervisor
-- Colunas: id, label, value (UNIQUE), description, active, created_by, created_at
-- ------------------------------------------------------------
CREATE TABLE setup_levels (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  label TEXT NOT NULL,
  value VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY setup_levels_value_key (value),
  CONSTRAINT fk_setup_levels_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Níveis de setup configuráveis pelo supervisor';

-- ------------------------------------------------------------
-- 2.6 teams
-- Equipes/times configuráveis pelo supervisor
-- Colunas: id, label, value (UNIQUE), description, active, created_by, created_at
-- ------------------------------------------------------------
CREATE TABLE teams (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  label TEXT NOT NULL,
  value VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY teams_value_key (value),
  CONSTRAINT fk_teams_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Equipes/times configuráveis pelo supervisor';

-- ------------------------------------------------------------
-- 2.7 tickets
-- Chamados com controle de tempo
-- Colunas: id, base_name, requester_name, requester_user_id, priority,
--          type, description, status, created_at, started_at, finished_at,
--          total_execution_seconds, total_paused_seconds, assigned_analyst_id,
--          pause_started_at, attachment_url, setup_level, team
-- Índices: status, assigned_analyst_id, (assigned_analyst_id+status), created_at DESC
-- ------------------------------------------------------------
CREATE TABLE tickets (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  base_name TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_user_id CHAR(36) DEFAULT NULL,
  priority VARCHAR(50) NOT NULL COMMENT 'Valores: baixa, media, alta, urgente',
  type VARCHAR(255) NOT NULL COMMENT 'Referência ao value de ticket_types',
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'nao_iniciado' COMMENT 'Valores: nao_iniciado, em_andamento, pausado, finalizado',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  started_at DATETIME(6) DEFAULT NULL,
  finished_at DATETIME(6) DEFAULT NULL,
  total_execution_seconds INT NOT NULL DEFAULT 0,
  total_paused_seconds INT NOT NULL DEFAULT 0,
  assigned_analyst_id CHAR(36) DEFAULT NULL,
  pause_started_at DATETIME(6) DEFAULT NULL,
  attachment_url TEXT DEFAULT NULL,
  setup_level VARCHAR(255) DEFAULT NULL COMMENT 'Referência ao value de setup_levels (pode ser NULL)',
  team VARCHAR(255) DEFAULT NULL COMMENT 'Referência ao value de teams (pode ser NULL)',
  PRIMARY KEY (id),
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_assigned_analyst_id (assigned_analyst_id),
  INDEX idx_tickets_analyst_status (assigned_analyst_id, status),
  INDEX idx_tickets_created_at_desc (created_at DESC),
  INDEX idx_tickets_setup_level (setup_level),
  INDEX idx_tickets_team (team),
  CONSTRAINT fk_tickets_requester_user_id FOREIGN KEY (requester_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_tickets_assigned_analyst_id FOREIGN KEY (assigned_analyst_id) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Chamados/tickets do sistema com controle de tempo';

-- ------------------------------------------------------------
-- 2.8 ticket_status_logs
-- Histórico de mudanças de status
-- Colunas: id, ticket_id, changed_by, old_status, new_status, changed_at
-- ------------------------------------------------------------
CREATE TABLE ticket_status_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  ticket_id CHAR(36) NOT NULL,
  changed_by CHAR(36) NOT NULL,
  old_status VARCHAR(50) NOT NULL,
  new_status VARCHAR(50) NOT NULL,
  changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_ticket_status_logs_ticket_id (ticket_id),
  INDEX idx_ticket_status_logs_changed_at (changed_at),
  CONSTRAINT fk_ticket_status_logs_ticket_id FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Log de mudanças de status dos chamados';

-- ------------------------------------------------------------
-- 2.9 pause_reasons
-- Motivos de pausa
-- Colunas: id, title, description, active, created_by, created_at
-- ------------------------------------------------------------
CREATE TABLE pause_reasons (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  title TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT fk_pause_reasons_created_by FOREIGN KEY (created_by) REFERENCES profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Motivos de pausa configuráveis pelo supervisor';

-- ------------------------------------------------------------
-- 2.10 pause_logs
-- Registros de pausas
-- Colunas: id, ticket_id, pause_reason_id, description_text,
--          pause_started_at, pause_ended_at, paused_seconds, created_by
-- Índices: ticket_id, (ticket_id+pause_ended_at)
-- ------------------------------------------------------------
CREATE TABLE pause_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  ticket_id CHAR(36) NOT NULL,
  pause_reason_id CHAR(36) NOT NULL,
  description_text TEXT DEFAULT NULL,
  pause_started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  pause_ended_at DATETIME(6) DEFAULT NULL,
  paused_seconds INT NOT NULL DEFAULT 0,
  created_by CHAR(36) NOT NULL,
  PRIMARY KEY (id),
  INDEX idx_pause_logs_ticket_id (ticket_id),
  INDEX idx_pause_logs_ticket_pause_ended (ticket_id, pause_ended_at),
  INDEX idx_pause_logs_created_by (created_by),
  CONSTRAINT fk_pause_logs_ticket_id FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_pause_logs_pause_reason_id FOREIGN KEY (pause_reason_id) REFERENCES pause_reasons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Registros de pausas dos chamados';

-- ------------------------------------------------------------
-- 2.11 pause_evidences
-- Evidências de pausa (arquivos)
-- Colunas: id, ticket_id, pause_log_id, file_url, uploaded_by, created_at
-- Índice: pause_log_id
-- ------------------------------------------------------------
CREATE TABLE pause_evidences (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  ticket_id CHAR(36) NOT NULL,
  pause_log_id CHAR(36) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_pause_evidences_pause_log_id (pause_log_id),
  INDEX idx_pause_evidences_ticket_id (ticket_id),
  CONSTRAINT fk_pause_evidences_ticket_id FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_pause_evidences_pause_log_id FOREIGN KEY (pause_log_id) REFERENCES pause_logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Arquivos de evidência anexados a pausas';

-- ------------------------------------------------------------
-- 2.12 pause_responses
-- Respostas a pendências
-- Colunas: id, pause_log_id, ticket_id, description_text, responded_by, created_at
-- ------------------------------------------------------------
CREATE TABLE pause_responses (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  pause_log_id CHAR(36) NOT NULL,
  ticket_id CHAR(36) NOT NULL,
  description_text TEXT NOT NULL,
  responded_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_pause_responses_pause_log_id (pause_log_id),
  INDEX idx_pause_responses_ticket_id (ticket_id),
  CONSTRAINT fk_pause_responses_pause_log_id FOREIGN KEY (pause_log_id) REFERENCES pause_logs(id) ON DELETE CASCADE,
  CONSTRAINT fk_pause_responses_ticket_id FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Respostas a pendências/pausas';

-- ------------------------------------------------------------
-- 2.13 pause_response_files
-- Arquivos de respostas de pausa
-- Colunas: id, pause_response_id, file_url, uploaded_by (nullable), created_at
-- ------------------------------------------------------------
CREATE TABLE pause_response_files (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  pause_response_id CHAR(36) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by CHAR(36) DEFAULT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_pause_response_files_response_id (pause_response_id),
  CONSTRAINT fk_pause_response_files_response_id FOREIGN KEY (pause_response_id) REFERENCES pause_responses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Arquivos anexados a respostas de pendências';

-- ------------------------------------------------------------
-- 2.14 assignment_control
-- Controle de rodízio (round-robin) para auto-atribuição
-- Colunas: id, last_assigned_user_id, updated_at
-- ------------------------------------------------------------
CREATE TABLE assignment_control (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  last_assigned_user_id CHAR(36) DEFAULT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Controle de atribuição round-robin';

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 3. DADOS INICIAIS
-- ============================================================

-- 3.1 Registro de controle de atribuição (necessário para o round-robin)
INSERT INTO assignment_control (id) VALUES (UUID());

-- 3.2 Tipos de chamado padrão
-- NOTA: Substitua '<ADMIN_USER_ID>' pelo UUID do seu usuário administrador
-- INSERT INTO ticket_types (label, value, created_by) VALUES
--   ('Setup Questionário', 'setup_questionario', '<ADMIN_USER_ID>'),
--   ('Cliente', 'cliente', '<ADMIN_USER_ID>'),
--   ('Ajuste', 'ajuste', '<ADMIN_USER_ID>'),
--   ('Outro', 'outro', '<ADMIN_USER_ID>');

-- 3.3 Níveis de setup padrão (exemplo)
-- INSERT INTO setup_levels (label, value, created_by) VALUES
--   ('Básico', 'basico', '<ADMIN_USER_ID>'),
--   ('Intermediário', 'intermediario', '<ADMIN_USER_ID>'),
--   ('Avançado', 'avancado', '<ADMIN_USER_ID>');

-- 3.4 Times padrão (exemplo)
-- INSERT INTO teams (label, value, created_by) VALUES
--   ('Time Alpha', 'alpha', '<ADMIN_USER_ID>'),
--   ('Time Beta', 'beta', '<ADMIN_USER_ID>');

-- ============================================================
-- 4. FUNÇÕES (STORED FUNCTIONS)
-- ============================================================

-- ------------------------------------------------------------
-- 4.1 has_role() — Equivalente ao security definer do PostgreSQL
-- Verifica se um user_id possui determinado role
-- Uso: SELECT has_role('uuid-do-user', 'supervisor');
-- ------------------------------------------------------------
DELIMITER //

CREATE FUNCTION has_role(
  p_user_id CHAR(36),
  p_role VARCHAR(20)
)
RETURNS TINYINT(1)
DETERMINISTIC
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
  RETURN (
    SELECT COUNT(*) > 0
    FROM user_roles
    WHERE user_id = p_user_id AND role = p_role
  );
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 4.2 get_user_role() — Retorna o papel de um usuário
-- Uso: SELECT get_user_role('uuid-do-user');
-- ------------------------------------------------------------
DELIMITER //

CREATE FUNCTION get_user_role(
  p_user_id CHAR(36)
)
RETURNS VARCHAR(20)
DETERMINISTIC
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
  DECLARE v_role VARCHAR(20) DEFAULT NULL;
  SELECT role INTO v_role
  FROM user_roles
  WHERE user_id = p_user_id
  LIMIT 1;
  RETURN v_role;
END //

DELIMITER ;

-- ============================================================
-- 5. STORED PROCEDURES
-- ============================================================

-- ------------------------------------------------------------
-- 5.1 sp_create_user — Cria perfil + role atomicamente
-- Substitui o trigger handle_new_user do Supabase
-- Uso: CALL sp_create_user('uuid', 'Nome do Usuário', 'analyst');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_create_user(
  IN p_user_id CHAR(36),
  IN p_name TEXT,
  IN p_role VARCHAR(20)
)
BEGIN
  INSERT INTO profiles (id, name) VALUES (p_user_id, p_name);
  INSERT INTO user_roles (user_id, role) VALUES (p_user_id, p_role);
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 5.2 sp_pause_ticket — Pausar um chamado
-- Valida que o ticket está em_andamento antes de pausar
-- Cria o pause_log e atualiza o status do ticket atomicamente
-- Uso: CALL sp_pause_ticket('ticket-uuid', 'reason-uuid', 'descrição', 'user-uuid');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_pause_ticket(
  IN p_ticket_id CHAR(36),
  IN p_pause_reason_id CHAR(36),
  IN p_description TEXT,
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);
  DECLARE v_now DATETIME(6) DEFAULT NOW(6);

  SELECT status INTO v_old_status FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_old_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não encontrado';
  END IF;

  IF v_old_status != 'em_andamento' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não está em andamento para ser pausado';
  END IF;

  UPDATE tickets
  SET status = 'pausado',
      pause_started_at = v_now
  WHERE id = p_ticket_id;

  INSERT INTO pause_logs (ticket_id, pause_reason_id, description_text, pause_started_at, created_by)
  VALUES (p_ticket_id, p_pause_reason_id, p_description, v_now, p_user_id);

  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, v_old_status, 'pausado');
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 5.3 sp_resume_ticket — Retomar um chamado pausado
-- Calcula o tempo de pausa, atualiza total_paused_seconds e fecha o pause_log
-- Uso: CALL sp_resume_ticket('ticket-uuid', 'user-uuid');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_resume_ticket(
  IN p_ticket_id CHAR(36),
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);
  DECLARE v_pause_start DATETIME(6);
  DECLARE v_paused_secs INT;
  DECLARE v_pause_log_id CHAR(36);

  SELECT status, pause_started_at INTO v_old_status, v_pause_start
  FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_old_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não encontrado';
  END IF;

  IF v_old_status != 'pausado' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não está pausado para ser retomado';
  END IF;

  SET v_paused_secs = TIMESTAMPDIFF(SECOND, v_pause_start, NOW(6));

  UPDATE tickets
  SET status = 'em_andamento',
      pause_started_at = NULL,
      total_paused_seconds = total_paused_seconds + v_paused_secs
  WHERE id = p_ticket_id;

  SELECT id INTO v_pause_log_id
  FROM pause_logs
  WHERE ticket_id = p_ticket_id AND pause_ended_at IS NULL
  ORDER BY pause_started_at DESC
  LIMIT 1;

  IF v_pause_log_id IS NOT NULL THEN
    UPDATE pause_logs
    SET pause_ended_at = NOW(6),
        paused_seconds = v_paused_secs
    WHERE id = v_pause_log_id;
  END IF;

  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, 'pausado', 'em_andamento');
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 5.4 sp_finish_ticket — Finalizar um chamado
-- Se estava pausado, acumula tempo de pausa antes de finalizar
-- Calcula total_execution_seconds desde started_at
-- Uso: CALL sp_finish_ticket('ticket-uuid', 'user-uuid');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_finish_ticket(
  IN p_ticket_id CHAR(36),
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);
  DECLARE v_started DATETIME(6);
  DECLARE v_exec_secs INT;

  SELECT status, started_at INTO v_old_status, v_started
  FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_old_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não encontrado';
  END IF;

  IF v_old_status = 'finalizado' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket já foi finalizado';
  END IF;

  -- Se estava pausado, acumular tempo de pausa antes de finalizar
  IF v_old_status = 'pausado' THEN
    BEGIN
      DECLARE v_pause_start DATETIME(6);
      DECLARE v_paused_secs INT DEFAULT 0;
      DECLARE v_pause_log_id CHAR(36);

      SELECT pause_started_at INTO v_pause_start FROM tickets WHERE id = p_ticket_id;

      IF v_pause_start IS NOT NULL THEN
        SET v_paused_secs = TIMESTAMPDIFF(SECOND, v_pause_start, NOW(6));

        UPDATE tickets
        SET total_paused_seconds = total_paused_seconds + v_paused_secs,
            pause_started_at = NULL
        WHERE id = p_ticket_id;

        SELECT id INTO v_pause_log_id
        FROM pause_logs
        WHERE ticket_id = p_ticket_id AND pause_ended_at IS NULL
        ORDER BY pause_started_at DESC LIMIT 1;

        IF v_pause_log_id IS NOT NULL THEN
          UPDATE pause_logs
          SET pause_ended_at = NOW(6), paused_seconds = v_paused_secs
          WHERE id = v_pause_log_id;
        END IF;
      END IF;
    END;
  END IF;

  SET v_exec_secs = TIMESTAMPDIFF(SECOND, v_started, NOW(6));

  UPDATE tickets
  SET status = 'finalizado',
      finished_at = NOW(6),
      total_execution_seconds = v_exec_secs
  WHERE id = p_ticket_id;

  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, v_old_status, 'finalizado');
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 5.5 sp_reopen_ticket — Reabrir um chamado (apenas supervisor)
-- Valida que apenas supervisores podem reabrir
-- Reseta finished_at e reinicia started_at
-- Uso: CALL sp_reopen_ticket('ticket-uuid', 'supervisor-uuid');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_reopen_ticket(
  IN p_ticket_id CHAR(36),
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);
  DECLARE v_is_supervisor TINYINT(1);

  SET v_is_supervisor = has_role(p_user_id, 'supervisor');

  IF v_is_supervisor = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Apenas supervisores podem reabrir chamados';
  END IF;

  SELECT status INTO v_old_status FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_old_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não encontrado';
  END IF;

  IF v_old_status != 'finalizado' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Apenas chamados finalizados podem ser reabertos';
  END IF;

  UPDATE tickets
  SET status = 'em_andamento',
      finished_at = NULL,
      started_at = NOW(6)
  WHERE id = p_ticket_id;

  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, 'finalizado', 'em_andamento');
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 5.6 sp_start_ticket — Iniciar um chamado não iniciado
-- Atribui o analista e marca started_at
-- Uso: CALL sp_start_ticket('ticket-uuid', 'user-uuid');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_start_ticket(
  IN p_ticket_id CHAR(36),
  IN p_user_id CHAR(36)
)
BEGIN
  DECLARE v_old_status VARCHAR(50);

  SELECT status INTO v_old_status FROM tickets WHERE id = p_ticket_id FOR UPDATE;

  IF v_old_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket não encontrado';
  END IF;

  IF v_old_status != 'nao_iniciado' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ticket já foi iniciado';
  END IF;

  UPDATE tickets
  SET status = 'em_andamento',
      started_at = NOW(6),
      assigned_analyst_id = p_user_id
  WHERE id = p_ticket_id;

  INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
  VALUES (p_ticket_id, p_user_id, 'nao_iniciado', 'em_andamento');
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 5.7 sp_bulk_import_tickets — Importação em massa de chamados
-- Insere um ticket com todos os campos incluindo setup_level e team
-- Uso: CALL sp_bulk_import_tickets('base', 'requester', 'user-uuid', 'alta', 'setup_questionario', 'desc', 'basico', 'alpha');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_bulk_import_tickets(
  IN p_base_name TEXT,
  IN p_requester_name TEXT,
  IN p_requester_user_id CHAR(36),
  IN p_priority VARCHAR(50),
  IN p_type VARCHAR(255),
  IN p_description TEXT,
  IN p_setup_level VARCHAR(255),
  IN p_team VARCHAR(255)
)
BEGIN
  INSERT INTO tickets (base_name, requester_name, requester_user_id, priority, type, description, setup_level, team)
  VALUES (p_base_name, p_requester_name, p_requester_user_id, p_priority, p_type, p_description, p_setup_level, p_team);
END //

DELIMITER ;

-- ============================================================
-- 6. TRIGGER: Auto-atribuição round-robin
-- Equivalente ao auto_assign_ticket do PostgreSQL
-- Quando um novo ticket é inserido, atribui automaticamente
-- ao próximo backoffice disponível em rodízio
-- ============================================================
DELIMITER //

CREATE TRIGGER trg_auto_assign_ticket
AFTER INSERT ON tickets
FOR EACH ROW
BEGIN
  DECLARE v_next_analyst CHAR(36) DEFAULT NULL;
  DECLARE v_last_assigned CHAR(36);
  DECLARE v_control_id CHAR(36);
  DECLARE v_count INT DEFAULT 0;

  -- Contar analistas com role 'backoffice'
  SELECT COUNT(*) INTO v_count
  FROM user_roles WHERE role = 'backoffice';

  -- Se não há backoffice cadastrado, não faz nada
  IF v_count > 0 THEN
    -- Buscar controle de atribuição
    SELECT id, last_assigned_user_id
    INTO v_control_id, v_last_assigned
    FROM assignment_control
    LIMIT 1;

    IF v_last_assigned IS NULL THEN
      -- Primeiro da lista
      SELECT user_id INTO v_next_analyst
      FROM user_roles WHERE role = 'backoffice'
      ORDER BY user_id ASC
      LIMIT 1;
    ELSE
      -- Próximo após o último atribuído (round-robin)
      SELECT user_id INTO v_next_analyst
      FROM user_roles
      WHERE role = 'backoffice' AND user_id > v_last_assigned
      ORDER BY user_id ASC
      LIMIT 1;

      -- Se não encontrou (fim da lista), volta ao início
      IF v_next_analyst IS NULL THEN
        SELECT user_id INTO v_next_analyst
        FROM user_roles WHERE role = 'backoffice'
        ORDER BY user_id ASC
        LIMIT 1;
      END IF;
    END IF;

    -- Atribuir ticket e iniciar automaticamente
    IF v_next_analyst IS NOT NULL THEN
      UPDATE tickets
      SET assigned_analyst_id = v_next_analyst,
          status = 'em_andamento',
          started_at = NOW(6)
      WHERE id = NEW.id;

      -- Registrar mudança de status
      INSERT INTO ticket_status_logs (ticket_id, changed_by, old_status, new_status)
      VALUES (NEW.id, v_next_analyst, 'nao_iniciado', 'em_andamento');

      -- Atualizar controle de rodízio
      UPDATE assignment_control
      SET last_assigned_user_id = v_next_analyst,
          updated_at = NOW(6)
      WHERE id = v_control_id;
    END IF;
  END IF;
END //

DELIMITER ;

-- ============================================================
-- 7. VIEWS AUXILIARES
-- ============================================================

-- 7.1 Tickets com nome do analista atribuído
CREATE OR REPLACE VIEW vw_tickets_with_analyst AS
SELECT
  t.*,
  p.name AS analyst_name
FROM tickets t
LEFT JOIN profiles p ON t.assigned_analyst_id = p.id;

-- 7.2 Tickets com nome do solicitante (pelo profile)
CREATE OR REPLACE VIEW vw_tickets_with_requester AS
SELECT
  t.*,
  p.name AS requester_profile_name
FROM tickets t
LEFT JOIN profiles p ON t.requester_user_id = p.id;

-- 7.3 Pausas com título do motivo
CREATE OR REPLACE VIEW vw_pause_logs_with_reason AS
SELECT
  pl.*,
  pr.title AS reason_title
FROM pause_logs pl
JOIN pause_reasons pr ON pl.pause_reason_id = pr.id;

-- 7.4 Tickets completos (analista + solicitante + tipo + setup_level + team)
CREATE OR REPLACE VIEW vw_tickets_full AS
SELECT
  t.*,
  analyst.name AS analyst_name,
  requester.name AS requester_profile_name,
  tt.label AS type_label,
  sl.label AS setup_level_label,
  tm.label AS team_label
FROM tickets t
LEFT JOIN profiles analyst ON t.assigned_analyst_id = analyst.id
LEFT JOIN profiles requester ON t.requester_user_id = requester.id
LEFT JOIN ticket_types tt ON t.type = tt.value
LEFT JOIN setup_levels sl ON t.setup_level = sl.value
LEFT JOIN teams tm ON t.team = tm.value;

-- 7.5 Resumo de pausas por ticket
CREATE OR REPLACE VIEW vw_ticket_pause_summary AS
SELECT
  ticket_id,
  COUNT(*) AS total_pauses,
  SUM(paused_seconds) AS total_paused_secs,
  MIN(pause_started_at) AS first_pause,
  MAX(COALESCE(pause_ended_at, NOW(6))) AS last_pause_activity
FROM pause_logs
GROUP BY ticket_id;

-- 7.6 Métricas por analista (backoffice)
CREATE OR REPLACE VIEW vw_analyst_metrics AS
SELECT
  p.id AS analyst_id,
  p.name AS analyst_name,
  COUNT(t.id) AS total_tickets,
  SUM(CASE WHEN t.status = 'finalizado' THEN 1 ELSE 0 END) AS finished_tickets,
  SUM(CASE WHEN t.status = 'em_andamento' THEN 1 ELSE 0 END) AS active_tickets,
  SUM(CASE WHEN t.status = 'pausado' THEN 1 ELSE 0 END) AS paused_tickets,
  AVG(CASE WHEN t.status = 'finalizado' THEN t.total_execution_seconds ELSE NULL END) AS avg_exec_seconds,
  AVG(CASE WHEN t.status = 'finalizado' THEN t.total_paused_seconds ELSE NULL END) AS avg_paused_seconds
FROM profiles p
INNER JOIN user_roles ur ON p.id = ur.user_id AND ur.role = 'backoffice'
LEFT JOIN tickets t ON p.id = t.assigned_analyst_id
GROUP BY p.id, p.name;

-- ============================================================
-- 8. FUNÇÕES DE VALIDAÇÃO DE ACESSO (Substituindo RLS)
-- ============================================================
-- MySQL não possui Row Level Security. As funções abaixo devem
-- ser chamadas pela API/backend para validar permissões antes
-- de executar queries.

-- ------------------------------------------------------------
-- 8.1 fn_can_access_ticket — Verifica se user pode ver um ticket
-- Regra original (Supabase RLS):
--   supervisor: acesso total
--   backoffice: assigned_analyst_id = uid OU assigned_analyst_id IS NULL
--   analyst: requester_user_id = uid
-- Retorna: 1 = permitido, 0 = negado
-- ------------------------------------------------------------
DELIMITER //

CREATE FUNCTION fn_can_access_ticket(
  p_user_id CHAR(36),
  p_ticket_id CHAR(36)
)
RETURNS TINYINT(1)
DETERMINISTIC
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
  -- Supervisor: acesso total
  IF has_role(p_user_id, 'supervisor') THEN
    RETURN 1;
  END IF;

  -- Backoffice: tickets atribuídos a ele OU não atribuídos
  IF has_role(p_user_id, 'backoffice') THEN
    RETURN (
      SELECT COUNT(*) > 0 FROM tickets
      WHERE id = p_ticket_id
        AND (assigned_analyst_id = p_user_id OR assigned_analyst_id IS NULL)
    );
  END IF;

  -- Analyst: apenas tickets que ele solicitou
  IF has_role(p_user_id, 'analyst') THEN
    RETURN (
      SELECT COUNT(*) > 0 FROM tickets
      WHERE id = p_ticket_id AND requester_user_id = p_user_id
    );
  END IF;

  RETURN 0;
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 8.2 sp_get_visible_tickets — Retorna tickets visíveis para o user
-- Uso: CALL sp_get_visible_tickets('user-uuid');
-- ------------------------------------------------------------
DELIMITER //

CREATE PROCEDURE sp_get_visible_tickets(
  IN p_user_id CHAR(36)
)
BEGIN
  IF has_role(p_user_id, 'supervisor') THEN
    SELECT * FROM vw_tickets_full ORDER BY created_at DESC;
  ELSEIF has_role(p_user_id, 'backoffice') THEN
    SELECT * FROM vw_tickets_full
    WHERE assigned_analyst_id = p_user_id OR assigned_analyst_id IS NULL
    ORDER BY created_at DESC;
  ELSEIF has_role(p_user_id, 'analyst') THEN
    SELECT * FROM vw_tickets_full
    WHERE requester_user_id = p_user_id
    ORDER BY created_at DESC;
  ELSE
    -- Nenhum acesso
    SELECT * FROM vw_tickets_full WHERE 1 = 0;
  END IF;
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 8.3 fn_can_update_ticket — Verifica se user pode atualizar um ticket
-- Mesma lógica do RLS de UPDATE (idêntica ao SELECT)
-- ------------------------------------------------------------
DELIMITER //

CREATE FUNCTION fn_can_update_ticket(
  p_user_id CHAR(36),
  p_ticket_id CHAR(36)
)
RETURNS TINYINT(1)
DETERMINISTIC
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
  RETURN fn_can_access_ticket(p_user_id, p_ticket_id);
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 8.4 fn_can_insert_ticket — Verifica se user pode criar um ticket
-- Regra original: analyst com requester_user_id = uid
-- NOTA: Tickets públicos (sem login) devem ser tratados na API
-- ------------------------------------------------------------
DELIMITER //

CREATE FUNCTION fn_can_insert_ticket(
  p_user_id CHAR(36)
)
RETURNS TINYINT(1)
DETERMINISTIC
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
  RETURN has_role(p_user_id, 'analyst');
END //

DELIMITER ;

-- ------------------------------------------------------------
-- 8.5 fn_can_manage_config — Verifica se user pode gerenciar configs
-- Aplicável a: ticket_types, setup_levels, teams, pause_reasons, requesters
-- Regra: apenas supervisores podem INSERT/UPDATE
-- ------------------------------------------------------------
DELIMITER //

CREATE FUNCTION fn_can_manage_config(
  p_user_id CHAR(36)
)
RETURNS TINYINT(1)
DETERMINISTIC
READS SQL DATA
SQL SECURITY DEFINER
BEGIN
  RETURN has_role(p_user_id, 'supervisor');
END //

DELIMITER ;

-- ============================================================
-- 9. TABELA DE SESSÕES (substituindo Supabase Auth)
-- Use esta tabela se implementar auth próprio.
-- Se usar Cognito/Auth0, esta tabela não é necessária.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  user_id CHAR(36) NOT NULL,
  token VARCHAR(512) NOT NULL COMMENT 'JWT ou session token',
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_sessions_user_id (user_id),
  INDEX idx_sessions_token (token(255)),
  INDEX idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user_id FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Sessões de autenticação (opcional, para auth próprio)';

-- ============================================================
-- 10. TABELA DE AUDIT LOG (opcional, substituindo Supabase logs)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id CHAR(36) DEFAULT NULL,
  action VARCHAR(100) NOT NULL COMMENT 'Ex: INSERT, UPDATE, DELETE, LOGIN, LOGOUT',
  table_name VARCHAR(100) DEFAULT NULL,
  record_id CHAR(36) DEFAULT NULL,
  old_data JSON DEFAULT NULL,
  new_data JSON DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_table (table_name),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Log de auditoria do sistema';

-- ============================================================
-- 11. EVENTO: Limpeza de sessões expiradas
-- Executa a cada hora para remover sessões vencidas
-- Requer: SET GLOBAL event_scheduler = ON;
-- ============================================================
DELIMITER //

CREATE EVENT IF NOT EXISTS evt_cleanup_expired_sessions
ON SCHEDULE EVERY 1 HOUR
STARTS CURRENT_TIMESTAMP
DO
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
END //

DELIMITER ;

-- ============================================================
-- 12. REFERÊNCIA: STORAGE BUCKETS → Amazon S3
-- ============================================================
-- No Supabase original existem 3 buckets de storage:
--
-- | Bucket             | Público | Equivalente AWS                       |
-- |--------------------|---------|---------------------------------------|
-- | pause-evidences    | Sim     | s3://seu-bucket/pause-evidences/      |
-- | ticket-attachments | Sim     | s3://seu-bucket/ticket-attachments/   |
-- | pause-responses    | Sim     | s3://seu-bucket/pause-responses/      |
--
-- Políticas de storage (converter para IAM/bucket policies):
--
-- pause-evidences:
--   SELECT: Qualquer pessoa pode ver (público)
--   INSERT: Apenas usuários autenticados
--
-- ticket-attachments:
--   SELECT: Qualquer pessoa pode ver (público)
--   INSERT: Qualquer pessoa pode fazer upload (formulário público)
--
-- pause-responses:
--   SELECT: Qualquer pessoa pode ver (público)
--   INSERT: Apenas usuários autenticados
--
-- Exemplo de política S3 para bucket público de leitura:
-- {
--   "Version": "2012-10-17",
--   "Statement": [{
--     "Sid": "PublicReadGetObject",
--     "Effect": "Allow",
--     "Principal": "*",
--     "Action": "s3:GetObject",
--     "Resource": "arn:aws:s3:::seu-bucket/pause-evidences/*"
--   }]
-- }
--
-- Para uploads autenticados, use presigned URLs gerados pelo backend (Lambda).

-- ============================================================
-- 13. REFERÊNCIA: EDGE FUNCTIONS → AWS Lambda
-- ============================================================
-- As seguintes Supabase Edge Functions precisam ser reimplementadas:
--
-- | Edge Function          | Descrição                                  | Equivalente AWS          |
-- |------------------------|--------------------------------------------|--------------------------|
-- | bulk-import-tickets    | Importação em massa via planilha XLSX      | Lambda + API Gateway     |
-- |                        | Campos: base_name, requester_name,         |                          |
-- |                        | priority, type, description,               |                          |
-- |                        | setup_level, team                          |                          |
-- | create-public-ticket   | Criação de ticket público (sem auth)       | Lambda + API Gateway     |
-- |                        | Com upload de anexo para S3                |                          |
-- | get-public-tickets     | Consulta pública de tickets pelo           | Lambda + API Gateway     |
-- |                        | requester_name (sem auth)                  |                          |
-- | manage-users           | CRUD de usuários (service role)            | Lambda + Cognito/IAM     |
-- |                        | Criar/deletar/listar usuários              |                          |
--
-- Cada Lambda deve:
-- 1. Validar JWT/sessão do chamador (exceto endpoints públicos)
-- 2. Verificar permissões usando has_role() ou fn_can_*()
-- 3. Executar a operação no MySQL via conexão RDS
-- 4. Retornar resultado em JSON
-- 5. Para uploads de arquivo, gerar presigned URL do S3

-- ============================================================
-- 14. REFERÊNCIA COMPLETA DE RLS → REGRAS DE API
-- ============================================================
-- Tabela de mapeamento de TODAS as políticas RLS para implementação na API:
--
-- | Tabela                | Operação | Regra                                                                     |
-- |-----------------------|----------|---------------------------------------------------------------------------|
-- | profiles              | SELECT   | Qualquer autenticado pode ver todos                                       |
-- | profiles              | UPDATE   | Apenas o próprio usuário (id = current_user_id)                           |
-- | profiles              | INSERT   | Apenas via trigger/procedure (sp_create_user)                             |
-- | profiles              | DELETE   | Não permitido                                                             |
-- | user_roles            | SELECT   | Supervisor vê todos; outros apenas o próprio                              |
-- | user_roles            | INSERT   | Não permitido (apenas via procedure)                                      |
-- | user_roles            | UPDATE   | Não permitido                                                             |
-- | user_roles            | DELETE   | Não permitido                                                             |
-- | tickets               | SELECT   | Supervisor: todos; Backoffice: assigned ou NULL; Analyst: próprios        |
-- | tickets               | INSERT   | Analyst com requester_user_id = uid; ou público (edge fn)                 |
-- | tickets               | UPDATE   | Supervisor: todos; Backoffice: assigned ou NULL; Analyst: próprios        |
-- | tickets               | DELETE   | Não permitido                                                             |
-- | ticket_status_logs    | SELECT   | Qualquer autenticado                                                      |
-- | ticket_status_logs    | INSERT   | Autenticado com changed_by = uid                                          |
-- | ticket_status_logs    | UPDATE   | Não permitido                                                             |
-- | ticket_status_logs    | DELETE   | Não permitido                                                             |
-- | ticket_types          | SELECT   | Autenticado: todos; Público: apenas active=true                           |
-- | ticket_types          | INSERT   | Apenas supervisor                                                         |
-- | ticket_types          | UPDATE   | Apenas supervisor                                                         |
-- | ticket_types          | DELETE   | Não permitido                                                             |
-- | setup_levels          | SELECT   | Autenticado: todos; Público: apenas active=true                           |
-- | setup_levels          | INSERT   | Apenas supervisor                                                         |
-- | setup_levels          | UPDATE   | Apenas supervisor                                                         |
-- | setup_levels          | DELETE   | Não permitido                                                             |
-- | teams                 | SELECT   | Autenticado: todos; Público: apenas active=true                           |
-- | teams                 | INSERT   | Apenas supervisor                                                         |
-- | teams                 | UPDATE   | Apenas supervisor                                                         |
-- | teams                 | DELETE   | Não permitido                                                             |
-- | pause_reasons         | SELECT   | Qualquer autenticado                                                      |
-- | pause_reasons         | INSERT   | Apenas supervisor                                                         |
-- | pause_reasons         | UPDATE   | Apenas supervisor                                                         |
-- | pause_reasons         | DELETE   | Não permitido                                                             |
-- | pause_logs            | SELECT   | Qualquer autenticado                                                      |
-- | pause_logs            | INSERT   | Autenticado com created_by = uid                                          |
-- | pause_logs            | UPDATE   | Qualquer autenticado                                                      |
-- | pause_logs            | DELETE   | Não permitido                                                             |
-- | pause_evidences       | SELECT   | Qualquer autenticado                                                      |
-- | pause_evidences       | INSERT   | Autenticado com uploaded_by = uid                                         |
-- | pause_evidences       | UPDATE   | Não permitido                                                             |
-- | pause_evidences       | DELETE   | Não permitido                                                             |
-- | pause_responses       | SELECT   | Qualquer autenticado                                                      |
-- | pause_responses       | INSERT   | Autenticado com responded_by = uid                                        |
-- | pause_responses       | UPDATE   | Não permitido                                                             |
-- | pause_responses       | DELETE   | Não permitido                                                             |
-- | pause_response_files  | SELECT   | Qualquer autenticado                                                      |
-- | pause_response_files  | INSERT   | Autenticado com uploaded_by = uid                                         |
-- | pause_response_files  | UPDATE   | Não permitido                                                             |
-- | pause_response_files  | DELETE   | Não permitido                                                             |
-- | requesters            | SELECT   | Público: apenas active=true; Autenticado: todos                           |
-- | requesters            | INSERT   | Apenas supervisor                                                         |
-- | requesters            | UPDATE   | Apenas supervisor                                                         |
-- | requesters            | DELETE   | Não permitido                                                             |
-- | assignment_control    | *        | Gerenciado internamente pelo trigger (sem acesso direto pela API)         |

-- ============================================================
-- 15. CHECKLIST DE VERIFICAÇÃO PÓS-INSTALAÇÃO
-- ============================================================
-- Execute os comandos abaixo para verificar a instalação:
--
-- 1. Listar todas as tabelas:
--    SHOW TABLES;
--
-- 2. Verificar funções:
--    SHOW FUNCTION STATUS WHERE Db = 'painel_chamados';
--    -- Esperado: has_role, get_user_role, fn_can_access_ticket,
--    --           fn_can_update_ticket, fn_can_insert_ticket, fn_can_manage_config
--
-- 3. Verificar procedures:
--    SHOW PROCEDURE STATUS WHERE Db = 'painel_chamados';
--    -- Esperado: sp_create_user, sp_pause_ticket, sp_resume_ticket,
--    --           sp_finish_ticket, sp_reopen_ticket, sp_start_ticket,
--    --           sp_bulk_import_tickets, sp_get_visible_tickets
--
-- 4. Verificar triggers:
--    SHOW TRIGGERS FROM painel_chamados;
--    -- Esperado: trg_auto_assign_ticket
--
-- 5. Verificar views:
--    SELECT * FROM information_schema.views WHERE table_schema = 'painel_chamados';
--    -- Esperado: vw_tickets_with_analyst, vw_tickets_with_requester,
--    --           vw_pause_logs_with_reason, vw_tickets_full,
--    --           vw_ticket_pause_summary, vw_analyst_metrics
--
-- 6. Verificar eventos:
--    SHOW EVENTS FROM painel_chamados;
--    -- Esperado: evt_cleanup_expired_sessions
--
-- 7. Verificar contagem de tabelas (esperado: 16):
--    SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'painel_chamados';
--
-- 8. Testar criação de usuário:
--    CALL sp_create_user(UUID(), 'Teste Admin', 'supervisor');
--
-- ============================================================
-- FIM DO SCRIPT DE MIGRAÇÃO
-- ============================================================
