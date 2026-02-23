# Guia Completo de Migração: Supabase → AWS (MySQL RDS)

> Este guia cobre **toda** a migração do sistema de chamados, do frontend ao backend, para funcionar 100% na AWS com MySQL.

---

## 📋 Índice

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Pré-requisitos AWS](#2-pré-requisitos-aws)
3. [Etapa 1: Criar o Banco MySQL no RDS](#3-etapa-1-criar-o-banco-mysql-no-rds)
4. [Etapa 2: Executar o Script de Migração](#4-etapa-2-executar-o-script-de-migração)
5. [Etapa 3: Migrar Dados do Supabase](#5-etapa-3-migrar-dados-do-supabase)
6. [Etapa 4: Configurar Autenticação (Cognito)](#6-etapa-4-configurar-autenticação-cognito)
7. [Etapa 5: Criar a API Backend (Node.js + Express)](#7-etapa-5-criar-a-api-backend-nodejs--express)
8. [Etapa 6: Migrar Storage para S3](#8-etapa-6-migrar-storage-para-s3)
9. [Etapa 7: Migrar Edge Functions para Lambda](#9-etapa-7-migrar-edge-functions-para-lambda)
10. [Etapa 8: Adaptar o Frontend](#10-etapa-8-adaptar-o-frontend)
11. [Etapa 9: Deploy na AWS](#11-etapa-9-deploy-na-aws)
12. [Etapa 10: Testes e Validação](#12-etapa-10-testes-e-validação)
13. [Checklist Final](#13-checklist-final)

---

## 1. Visão Geral da Arquitetura

### Antes (Supabase)
```
Frontend (React) → Supabase Client SDK → Supabase (PostgreSQL + Auth + Storage + Edge Functions)
```

### Depois (AWS)
```
Frontend (React) → API Gateway → Lambda/Express (EC2/ECS) → MySQL RDS
                                     ↓
                              Cognito (Auth)
                              S3 (Storage)
```

### Mapeamento de Serviços

| Supabase           | AWS Equivalente              | Observação                          |
|--------------------|------------------------------|--------------------------------------|
| PostgreSQL         | **RDS MySQL 8.0+**           | Usar script `mysql_migration_script.sql` |
| Supabase Auth      | **AWS Cognito**              | Ou JWT customizado                   |
| RLS Policies       | **Middleware na API**        | Implementar no backend               |
| Edge Functions     | **AWS Lambda**               | Ou rotas no Express                  |
| Storage Buckets    | **Amazon S3**                | Com CloudFront para CDN              |
| Realtime           | **WebSocket (API Gateway)**  | Ou polling no frontend               |

---

## 2. Pré-requisitos AWS

### Conta e Ferramentas
```bash
# 1. Instalar AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip && sudo ./aws/install

# 2. Configurar credenciais
aws configure
# AWS Access Key ID: <sua-key>
# AWS Secret Access Key: <sua-secret>
# Default region: sa-east-1 (São Paulo)
# Default output: json

# 3. Instalar Node.js 18+
# 4. Instalar MySQL client local
sudo apt install mysql-client-core-8.0
```

### Serviços AWS Necessários
- **RDS** (MySQL 8.0)
- **Cognito** (User Pool)
- **S3** (Buckets)
- **EC2 ou ECS** (Backend API) — ou **Lambda + API Gateway**
- **CloudFront** (CDN opcional)
- **Amplify** ou **S3 + CloudFront** (Hosting frontend)
- **IAM** (Permissões)
- **VPC** (Rede privada)

---

## 3. Etapa 1: Criar o Banco MySQL no RDS

### Via Console AWS:
1. Acesse **RDS → Create Database**
2. Configurações:
   - **Engine:** MySQL 8.0.35+
   - **Template:** Production (ou Free Tier para teste)
   - **DB Instance Identifier:** `chamados-db`
   - **Master username:** `admin`
   - **Master password:** (defina uma senha forte)
   - **Instance class:** `db.t3.micro` (dev) ou `db.t3.medium` (prod)
   - **Storage:** 20 GB GP3 (com auto scaling)
   - **VPC:** Selecione ou crie uma VPC
   - **Public access:** `Yes` (para setup inicial, depois desabilitar)
   - **Database name:** `chamados_db`

### Via CLI:
```bash
aws rds create-db-instance \
  --db-instance-identifier chamados-db \
  --db-instance-class db.t3.micro \
  --engine mysql \
  --engine-version 8.0.35 \
  --master-username admin \
  --master-user-password "SuaSenhaForte123!" \
  --allocated-storage 20 \
  --db-name chamados_db \
  --vpc-security-group-ids sg-xxxxxxxx \
  --availability-zone sa-east-1a \
  --backup-retention-period 7 \
  --storage-type gp3 \
  --publicly-accessible
```

### Security Group — Liberar porta 3306:
```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 3306 \
  --cidr 0.0.0.0/0  # restringir depois para IP do backend
```

### Conectar e testar:
```bash
mysql -h chamados-db.xxxxxxxxx.sa-east-1.rds.amazonaws.com \
      -u admin -p chamados_db
```

---

## 4. Etapa 2: Executar o Script de Migração

```bash
# Conectar ao RDS e executar o script
mysql -h <SEU-ENDPOINT-RDS> -u admin -p chamados_db < mysql_migration_script.sql
```

### Verificar se tudo foi criado:
```sql
-- Listar tabelas
SHOW TABLES;

-- Verificar estrutura
DESCRIBE tickets;
DESCRIBE profiles;
DESCRIBE user_roles;

-- Verificar procedures
SHOW PROCEDURE STATUS WHERE Db = 'chamados_db';

-- Verificar functions
SHOW FUNCTION STATUS WHERE Db = 'chamados_db';

-- Verificar triggers
SHOW TRIGGERS;
```

---

## 5. Etapa 3: Migrar Dados do Supabase

### 5.1 Exportar dados do Supabase (PostgreSQL)
```bash
# No terminal, conectar ao Supabase e exportar como CSV
# Substituir <SUPABASE_DB_URL> pela sua connection string

# Exportar cada tabela
psql "<SUPABASE_DB_URL>" -c "\COPY profiles TO 'profiles.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY user_roles TO 'user_roles.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY ticket_types TO 'ticket_types.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY requesters TO 'requesters.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY pause_reasons TO 'pause_reasons.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY tickets TO 'tickets.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY ticket_status_logs TO 'ticket_status_logs.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY pause_logs TO 'pause_logs.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY pause_evidences TO 'pause_evidences.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY pause_responses TO 'pause_responses.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY pause_response_files TO 'pause_response_files.csv' WITH CSV HEADER"
psql "<SUPABASE_DB_URL>" -c "\COPY assignment_control TO 'assignment_control.csv' WITH CSV HEADER"
```

### 5.2 Importar no MySQL (RDS)
```bash
# Para cada tabela, importar o CSV
# IMPORTANTE: Desabilitar triggers e checks antes da importação

mysql -h <SEU-ENDPOINT-RDS> -u admin -p chamados_db <<'EOF'

SET FOREIGN_KEY_CHECKS = 0;
SET @DISABLE_TRIGGERS = 1;

-- Importar profiles
LOAD DATA LOCAL INFILE 'profiles.csv'
INTO TABLE profiles
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(id, name, @created_at)
SET created_at = STR_TO_DATE(@created_at, '%Y-%m-%d %H:%i:%s');

-- Importar user_roles
LOAD DATA LOCAL INFILE 'user_roles.csv'
INTO TABLE user_roles
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar ticket_types
LOAD DATA LOCAL INFILE 'ticket_types.csv'
INTO TABLE ticket_types
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar requesters
LOAD DATA LOCAL INFILE 'requesters.csv'
INTO TABLE requesters
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar pause_reasons
LOAD DATA LOCAL INFILE 'pause_reasons.csv'
INTO TABLE pause_reasons
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar tickets
LOAD DATA LOCAL INFILE 'tickets.csv'
INTO TABLE tickets
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar ticket_status_logs
LOAD DATA LOCAL INFILE 'ticket_status_logs.csv'
INTO TABLE ticket_status_logs
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar pause_logs
LOAD DATA LOCAL INFILE 'pause_logs.csv'
INTO TABLE pause_logs
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar pause_evidences
LOAD DATA LOCAL INFILE 'pause_evidences.csv'
INTO TABLE pause_evidences
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar pause_responses
LOAD DATA LOCAL INFILE 'pause_responses.csv'
INTO TABLE pause_responses
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar pause_response_files
LOAD DATA LOCAL INFILE 'pause_response_files.csv'
INTO TABLE pause_response_files
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- Importar assignment_control
LOAD DATA LOCAL INFILE 'assignment_control.csv'
INTO TABLE assignment_control
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

SET FOREIGN_KEY_CHECKS = 1;

EOF
```

### 5.3 Exportar senhas dos usuários
> ⚠️ **IMPORTANTE:** As senhas do Supabase Auth são hash bcrypt. Você pode:
> - **Opção A:** Recriar os usuários no Cognito e pedir reset de senha
> - **Opção B:** Usar migração customizada do Cognito com trigger Lambda para verificar hash bcrypt

---

## 6. Etapa 4: Configurar Autenticação (Cognito)

### 6.1 Criar User Pool
```bash
aws cognito-idp create-user-pool \
  --pool-name chamados-user-pool \
  --auto-verified-attributes email \
  --username-attributes email \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 6,
      "RequireUppercase": false,
      "RequireLowercase": false,
      "RequireNumbers": false,
      "RequireSymbols": false
    }
  }' \
  --schema '[
    {"Name":"email","Required":true,"Mutable":true},
    {"Name":"name","Required":false,"Mutable":true},
    {"Name":"custom:role","AttributeDataType":"String","Mutable":true,"Required":false}
  ]'
```

### 6.2 Criar App Client
```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id <USER_POOL_ID> \
  --client-name chamados-web-client \
  --no-generate-secret \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --callback-urls '["http://localhost:5173","https://seudominio.com"]' \
  --logout-urls '["http://localhost:5173","https://seudominio.com"]'
```

### 6.3 Migrar Usuários Existentes

Crie um script Node.js para migrar:

```javascript
// migrate-users.js
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const mysql = require('mysql2/promise');

const cognito = new CognitoIdentityProviderClient({ region: 'sa-east-1' });
const USER_POOL_ID = '<SEU_USER_POOL_ID>';

async function migrateUsers() {
  const db = await mysql.createConnection({
    host: '<SEU-ENDPOINT-RDS>',
    user: 'admin',
    password: 'SuaSenhaForte123!',
    database: 'chamados_db'
  });

  // Buscar todos os perfis e roles
  const [users] = await db.execute(`
    SELECT p.id, p.name, ur.role
    FROM profiles p
    LEFT JOIN user_roles ur ON ur.user_id = p.id
  `);

  for (const user of users) {
    try {
      // Criar no Cognito (vai precisar do email - pegue do Supabase antes)
      await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: user.email,  // precisa ter o email
        UserAttributes: [
          { Name: 'email', Value: user.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: user.name },
          { Name: 'custom:role', Value: user.role || 'backoffice' },
          { Name: 'custom:db_user_id', Value: user.id }
        ],
        MessageAction: 'SUPPRESS' // não enviar email de boas-vindas
      }));

      // Definir senha temporária (usuário vai precisar trocar)
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: user.email,
        Password: 'TrocarSenha123!',
        Permanent: false
      }));

      console.log(`✅ Migrado: ${user.name}`);
    } catch (err) {
      console.error(`❌ Erro ao migrar ${user.name}:`, err.message);
    }
  }

  await db.end();
}

migrateUsers();
```

---

## 7. Etapa 5: Criar a API Backend (Node.js + Express)

### 7.1 Estrutura do Projeto Backend

```
chamados-api/
├── src/
│   ├── index.ts                 # Entry point
│   ├── config/
│   │   ├── database.ts          # Conexão MySQL
│   │   └── cognito.ts           # Config Cognito
│   ├── middleware/
│   │   ├── auth.ts              # Verificação JWT Cognito
│   │   ├── rbac.ts              # Controle de acesso por role
│   │   └── error-handler.ts
│   ├── routes/
│   │   ├── tickets.ts
│   │   ├── users.ts
│   │   ├── pause-reasons.ts
│   │   ├── ticket-types.ts
│   │   ├── requesters.ts
│   │   ├── metrics.ts
│   │   └── public.ts            # Rotas sem auth
│   ├── services/
│   │   ├── ticket.service.ts
│   │   ├── user.service.ts
│   │   └── upload.service.ts    # S3 uploads
│   └── types/
│       └── index.ts
├── package.json
├── tsconfig.json
└── .env
```

### 7.2 Configuração Inicial

```bash
mkdir chamados-api && cd chamados-api
npm init -y
npm install express mysql2 cors helmet dotenv jsonwebtoken jwks-rsa
npm install @aws-sdk/client-s3 @aws-sdk/client-cognito-identity-provider
npm install -D typescript @types/express @types/node @types/cors ts-node nodemon
npx tsc --init
```

### 7.3 Arquivo `.env`
```env
# Database
DB_HOST=chamados-db.xxxxxxxxx.sa-east-1.rds.amazonaws.com
DB_PORT=3306
DB_USER=admin
DB_PASSWORD=SuaSenhaForte123!
DB_NAME=chamados_db

# Cognito
COGNITO_USER_POOL_ID=sa-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxx
COGNITO_REGION=sa-east-1

# S3
S3_BUCKET_ATTACHMENTS=chamados-ticket-attachments
S3_BUCKET_EVIDENCES=chamados-pause-evidences
S3_BUCKET_RESPONSES=chamados-pause-responses
S3_REGION=sa-east-1

# Server
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

### 7.4 Conexão com o Banco (`src/config/database.ts`)
```typescript
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

export default pool;
```

### 7.5 Middleware de Auth (`src/middleware/auth.ts`)
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';

const COGNITO_REGION = process.env.COGNITO_REGION!;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

const jwksClient = jwksRsa({
  jwksUri: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 600000, // 10 min
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  jwksClient.getSigningKey(header.kid!, (err, key) => {
    if (err) return callback(err);
    callback(null, key?.getPublicKey());
  });
}

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: string;
  userEmail?: string;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  jwt.verify(token, getKey, {
    issuer: `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/${USER_POOL_ID}`,
  }, (err, decoded: any) => {
    if (err) return res.status(401).json({ error: 'Token inválido' });

    req.userId = decoded['custom:db_user_id'] || decoded.sub;
    req.userRole = decoded['custom:role'];
    req.userEmail = decoded.email;
    next();
  });
};
```

### 7.6 Middleware RBAC (`src/middleware/rbac.ts`)
```typescript
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import db from '../config/database';

// Replica TODAS as 28 RLS policies do Supabase
export const requireRole = (...roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) return res.status(401).json({ error: 'Não autenticado' });

    const [rows] = await db.execute<any[]>(
      'SELECT role FROM user_roles WHERE user_id = ?',
      [req.userId]
    );

    if (rows.length === 0) return res.status(403).json({ error: 'Sem perfil' });

    const userRole = rows[0].role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    req.userRole = userRole;
    next();
  };
};

// Middleware que filtra tickets por role (equivalente ao RLS)
export const ticketAccessFilter = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.userId) return res.status(401).json({ error: 'Não autenticado' });

  const [rows] = await db.execute<any[]>(
    'SELECT role FROM user_roles WHERE user_id = ?',
    [req.userId]
  );

  const role = rows[0]?.role;

  if (role === 'supervisor') {
    // Supervisor: acesso total
    req.query._accessFilter = 'none';
  } else if (role === 'backoffice') {
    // Backoffice: apenas atribuídos a ele
    req.query._accessFilter = 'assigned';
    req.query._accessUserId = req.userId;
  } else if (role === 'analyst') {
    // Analista/Solicitante: apenas seus chamados
    req.query._accessFilter = 'requester';
    req.query._accessUserId = req.userId;
  }

  next();
};
```

### 7.7 Rotas de Tickets (`src/routes/tickets.ts`)
```typescript
import { Router } from 'express';
import db from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ticketAccessFilter } from '../middleware/rbac';

const router = Router();

// GET /api/tickets - Listar tickets (com filtro RLS)
router.get('/', authenticate, ticketAccessFilter, async (req: AuthRequest, res) => {
  try {
    let query = 'SELECT t.*, p.name as analyst_name FROM tickets t LEFT JOIN profiles p ON p.id = t.assigned_analyst_id';
    const params: any[] = [];

    const filter = req.query._accessFilter;
    if (filter === 'assigned') {
      query += ' WHERE t.assigned_analyst_id = ?';
      params.push(req.query._accessUserId);
    } else if (filter === 'requester') {
      query += ' WHERE t.requester_user_id = ?';
      params.push(req.query._accessUserId);
    }

    query += ' ORDER BY t.created_at DESC';

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tickets - Criar ticket
router.post('/', authenticate, async (req: AuthRequest, res) => {
  const { base_name, requester_name, priority, type, description, attachment_url } = req.body;
  try {
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO tickets (id, base_name, requester_name, requester_user_id, priority, type, description, attachment_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, base_name, requester_name, req.userId, priority, type, description, attachment_url || null]
    );

    // O trigger auto_assign vai rodar automaticamente
    const [rows] = await db.execute('SELECT * FROM tickets WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tickets/:id/pause - Pausar ticket
router.put('/:id/pause', authenticate, async (req: AuthRequest, res) => {
  const { pause_reason_id, description_text } = req.body;
  try {
    await db.execute('CALL sp_pause_ticket(?, ?, ?, ?)', [
      req.params.id,
      req.userId,
      pause_reason_id,
      description_text || null
    ]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tickets/:id/resume - Retomar ticket
router.put('/:id/resume', authenticate, async (req: AuthRequest, res) => {
  try {
    await db.execute('CALL sp_resume_ticket(?, ?)', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tickets/:id/finish - Finalizar ticket
router.put('/:id/finish', authenticate, async (req: AuthRequest, res) => {
  try {
    await db.execute('CALL sp_finish_ticket(?, ?)', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tickets/:id/reopen - Reabrir ticket (supervisor)
router.put('/:id/reopen', authenticate, async (req: AuthRequest, res) => {
  if (req.userRole !== 'supervisor') return res.status(403).json({ error: 'Apenas supervisor' });
  try {
    await db.execute('CALL sp_reopen_ticket(?, ?)', [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

### 7.8 Rota Pública (`src/routes/public.ts`)
```typescript
import { Router } from 'express';
import db from '../config/database';

const router = Router();

// POST /api/public/ticket - Criar chamado sem login
router.post('/ticket', async (req, res) => {
  const { base_name, requester_name, priority, type, description, attachment_url } = req.body;
  try {
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO tickets (id, base_name, requester_name, priority, type, description, attachment_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, base_name, requester_name, priority, type, description, attachment_url || null]
    );
    const [rows] = await db.execute('SELECT * FROM tickets WHERE id = ?', [id]);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

### 7.9 Upload S3 (`src/services/upload.service.ts`)
```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: process.env.S3_REGION });

export async function getUploadUrl(bucket: string, key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function getDownloadUrl(bucket: string, key: string) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}
```

### 7.10 Entry Point (`src/index.ts`)
```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import ticketRoutes from './routes/tickets';
import publicRoutes from './routes/public';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Rotas
app.use('/api/tickets', ticketRoutes);
app.use('/api/public', publicRoutes);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 API rodando na porta ${PORT}`));
```

---

## 8. Etapa 6: Migrar Storage para S3

### 8.1 Criar Buckets
```bash
# Criar buckets equivalentes
aws s3 mb s3://chamados-ticket-attachments --region sa-east-1
aws s3 mb s3://chamados-pause-evidences --region sa-east-1
aws s3 mb s3://chamados-pause-responses --region sa-east-1
```

### 8.2 Configurar CORS nos Buckets
```bash
# Para cada bucket
aws s3api put-bucket-cors --bucket chamados-ticket-attachments --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST"],
      "AllowedOrigins": ["http://localhost:5173", "https://seudominio.com"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}'
```

### 8.3 Migrar Arquivos do Supabase para S3
```bash
# Baixar do Supabase Storage e subir no S3
# Para cada bucket, listar e baixar os arquivos

# Exemplo com script Node.js:
# 1. Listar arquivos do Supabase Storage
# 2. Baixar cada arquivo
# 3. Fazer upload para S3
# 4. Atualizar URLs no banco MySQL
```

---

## 9. Etapa 7: Migrar Edge Functions para Lambda

### Mapeamento:

| Edge Function              | Lambda Equivalente         | Trigger           |
|----------------------------|----------------------------|--------------------|
| `create-public-ticket`     | Rota `/api/public/ticket`  | API Gateway        |
| `bulk-import-tickets`      | `bulk-import-lambda`       | API Gateway        |
| `manage-users`             | `manage-users-lambda`      | API Gateway        |

> **Nota:** Se você usar Express no EC2/ECS, pode simplesmente adicionar as rotas diretamente no Express ao invés de criar Lambdas separadas. Lambdas são recomendadas se quiser serverless.

---

## 10. Etapa 8: Adaptar o Frontend

### 10.1 Instalar dependências AWS
```bash
npm install amazon-cognito-identity-js @aws-sdk/client-s3
npm uninstall @supabase/supabase-js  # remover Supabase SDK
```

### 10.2 Criar API Client (`src/lib/api.ts`)
```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }

    return res.json();
  }

  get<T>(path: string) { return this.request<T>(path); }

  post<T>(path: string, body: any) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  put<T>(path: string, body?: any) {
    return this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
```

### 10.3 Adaptar AuthContext para Cognito
```typescript
// src/contexts/AuthContext.tsx — versão AWS Cognito
import React, { createContext, useContext, useEffect, useState } from 'react';
import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';
import { api } from '@/lib/api';

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
});

interface AuthContextType {
  user: { id: string; email: string; name: string } | null;
  role: 'supervisor' | 'analyst' | 'backoffice' | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthContextType['user']>(null);
  const [role, setRole] = useState<AuthContextType['role']>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session?.isValid()) {
          setLoading(false);
          return;
        }
        const token = session.getIdToken().getJwtToken();
        const payload = session.getIdToken().decodePayload();
        api.setToken(token);
        setUser({
          id: payload['custom:db_user_id'] || payload.sub,
          email: payload.email,
          name: payload.name || payload.email,
        });
        setRole(payload['custom:role'] as any);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    return new Promise<{ error: Error | null }>((resolve) => {
      const cognitoUser = new CognitoUser({ Username: email, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: email, Password: password });

      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (session) => {
          const token = session.getIdToken().getJwtToken();
          const payload = session.getIdToken().decodePayload();
          api.setToken(token);
          setUser({
            id: payload['custom:db_user_id'] || payload.sub,
            email: payload.email,
            name: payload.name || payload.email,
          });
          setRole(payload['custom:role'] as any);
          resolve({ error: null });
        },
        onFailure: (err) => resolve({ error: err }),
        newPasswordRequired: () => {
          // Usuário precisa trocar senha (primeira vez após migração)
          resolve({ error: new Error('NOVA_SENHA_NECESSARIA') });
        },
      });
    });
  };

  const signOut = async () => {
    const cognitoUser = userPool.getCurrentUser();
    cognitoUser?.signOut();
    api.setToken(null);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user: user as any, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
```

### 10.4 Substituir chamadas Supabase por API

**Antes (Supabase):**
```typescript
const { data } = await supabase.from('tickets').select('*').eq('status', 'em_andamento');
```

**Depois (API REST):**
```typescript
const data = await api.get<Ticket[]>('/tickets?status=em_andamento');
```

### 10.5 Mapeamento Completo de Chamadas

| Supabase (antes)                                   | API REST (depois)                          |
|----------------------------------------------------|--------------------------------------------|
| `supabase.from('tickets').select('*')`             | `api.get('/tickets')`                      |
| `supabase.from('tickets').insert({...})`           | `api.post('/tickets', {...})`              |
| `supabase.from('tickets').update({...}).eq()`      | `api.put('/tickets/:id', {...})`           |
| `supabase.functions.invoke('manage-users')`        | `api.post('/users', {...})`               |
| `supabase.functions.invoke('create-public-ticket')`| `api.post('/public/ticket', {...})`        |
| `supabase.functions.invoke('bulk-import-tickets')` | `api.post('/tickets/bulk-import', {...})`  |
| `supabase.storage.from('x').upload()`              | Upload via presigned URL do S3             |
| `supabase.auth.signInWithPassword()`               | `authContext.signIn(email, password)`      |
| `supabase.auth.signOut()`                          | `authContext.signOut()`                    |

---

## 11. Etapa 9: Deploy na AWS

### 11.1 Backend — Opção A: EC2

```bash
# 1. Criar EC2 (Amazon Linux 2023)
# 2. SSH na instância
ssh -i chave.pem ec2-user@<IP_PUBLICO>

# 3. Instalar Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# 4. Clonar projeto e instalar
git clone <seu-repo> && cd chamados-api
npm install && npm run build

# 5. Usar PM2 para manter rodando
npm install -g pm2
pm2 start dist/index.js --name chamados-api
pm2 save && pm2 startup
```

### 11.2 Backend — Opção B: ECS (Docker)

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 11.3 Frontend — AWS Amplify

```bash
# 1. Conectar repositório no Amplify Console
# 2. Configurar variáveis de ambiente:
#    VITE_API_URL=https://api.seudominio.com/api
#    VITE_COGNITO_USER_POOL_ID=sa-east-1_XXXXXXX
#    VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxx
# 3. Build settings (auto-detectado para Vite):
#    Build command: npm run build
#    Output: dist
```

### 11.4 Frontend — Alternativa S3 + CloudFront

```bash
# Build
npm run build

# Upload para S3
aws s3 sync dist/ s3://chamados-frontend --delete

# Criar distribuição CloudFront apontando para o bucket
```

---

## 12. Etapa 10: Testes e Validação

### Checklist de Testes

```markdown
- [ ] Login/Logout funciona com Cognito
- [ ] Criar chamado público (sem login)
- [ ] Criar chamado como Analista
- [ ] Chamado é atribuído automaticamente (round-robin)
- [ ] Backoffice visualiza apenas seus chamados
- [ ] Backoffice pode pausar/retomar/finalizar
- [ ] Supervisor visualiza todos os chamados
- [ ] Supervisor pode reabrir chamados
- [ ] Upload de anexos funciona via S3
- [ ] Upload de evidências de pausa funciona
- [ ] Métricas/Dashboard carregam corretamente
- [ ] Gerenciamento de usuários funciona
- [ ] Importação em massa funciona
- [ ] Notificações in-app funcionam
- [ ] Timer de execução calcula corretamente
```

---

## 13. Checklist Final

### Infraestrutura
- [ ] RDS MySQL criado e acessível
- [ ] Script de migração executado sem erros
- [ ] Dados migrados do Supabase
- [ ] Cognito User Pool configurado
- [ ] Usuários migrados para Cognito
- [ ] Buckets S3 criados com CORS
- [ ] Arquivos migrados do Supabase Storage
- [ ] Backend deployado (EC2/ECS/Lambda)
- [ ] Frontend deployado (Amplify/S3+CloudFront)
- [ ] SSL/TLS configurado (ACM)
- [ ] Domínio configurado (Route 53)

### Segurança
- [ ] RDS não exposto publicamente (após setup)
- [ ] Security Groups restritivos
- [ ] IAM roles com least privilege
- [ ] Secrets no AWS Secrets Manager (não .env)
- [ ] CORS restrito ao domínio de produção
- [ ] Rate limiting na API
- [ ] Logs habilitados (CloudWatch)

### Monitoramento
- [ ] CloudWatch Alarms para RDS (CPU, conexões, storage)
- [ ] CloudWatch Logs para API
- [ ] Health check endpoint monitorado
- [ ] Backup automático do RDS habilitado

---

## ⚡ Resumo de Custos Estimados (mensal)

| Serviço            | Config                    | Custo Estimado |
|--------------------|---------------------------|----------------|
| RDS MySQL          | db.t3.micro (Free Tier)   | $0 – $15/mês   |
| EC2 (backend)      | t3.micro (Free Tier)      | $0 – $10/mês   |
| S3 (storage)       | < 5 GB                    | ~$0.12/mês      |
| Cognito            | < 50k MAU                 | Gratuito        |
| CloudFront (CDN)   | < 1 TB/mês                | ~$0.085/GB      |
| Amplify (frontend) | Build + Hosting           | ~$0 – $5/mês   |
| **Total estimado** |                           | **$0 – $30/mês** |

---

> **Dica:** Para ambientes de teste, use o Free Tier da AWS (12 meses grátis para a maioria dos serviços).
> Para produção, considere **Aurora MySQL Serverless v2** para escalabilidade automática.
