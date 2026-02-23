import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const ANDRE_ID = "2b9383d5-fc10-4d2e-9e38-1a9e88be1181";

function mapType(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (/quest|pmoc/.test(r)) return "setup_questionario";
  if (/cliente|colaborador|fornecedor/.test(r)) return "cliente";
  if (/equipamento|produto/.test(r)) return "ajuste";
  return "outro";
}

function mapStatus(raw: string): string {
  const r = raw.toLowerCase().trim();
  if (r.includes("concluido") || r.includes("cancelado")) return "finalizado";
  if (r.includes("aguardando")) return "pausado";
  if (r.includes("andamento")) return "em_andamento";
  if (r.includes("não iniciado") || r.includes("nao iniciado")) return "nao_iniciado";
  return "nao_iniciado";
}

// Parse dates like "2/2/26", "12/02/2026 11:08:13", etc.
function parseDate(raw: string): string | null {
  if (!raw || raw.trim() === "") return null;
  const s = raw.trim();
  
  // Try MM/DD/YYYY HH:MM:SS or DD/MM/YYYY HH:MM:SS
  const dtMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):?(\d{2})?$/);
  if (dtMatch) {
    let [, p1, p2, yr, h, m, sec] = dtMatch;
    let year = parseInt(yr);
    if (year < 100) year += 2000;
    // Determine if day/month or month/day - use context (Feb 2026 data)
    let month = parseInt(p1);
    let day = parseInt(p2);
    if (month > 12) { month = parseInt(p2); day = parseInt(p1); }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${m}:${sec || '00'}`;
  }
  
  // Simple date M/D/YY
  const simple = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (simple) {
    let [, p1, p2, yr] = simple;
    let year = parseInt(yr);
    if (year < 100) year += 2000;
    let month = parseInt(p1);
    let day = parseInt(p2);
    if (month > 12) { month = parseInt(p2); day = parseInt(p1); }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T08:00:00`;
  }
  
  return null;
}

interface RawRecord {
  requester_name: string;
  base_name: string;
  created_at_raw: string;
  finished_at_raw: string;
  execution_time: string;
  status_raw: string;
  type_raw: string;
  assigned: string;
}

// 93 records from the spreadsheet
const RAW_DATA: RawRecord[] = [
  { requester_name: "Guilherme", base_name: "218704 - SUPORTE", created_at_raw: "2/2/26", finished_at_raw: "2/2/26", execution_time: "00:09", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Daniela", base_name: "220818 - Move Engenharia e Elevadores", created_at_raw: "2/2/26", finished_at_raw: "12/02/2026 11:08:13", execution_time: "06:20", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Jullia", base_name: "81223 - Center Line", created_at_raw: "2/2/26", finished_at_raw: "", execution_time: "", status_raw: "Cancelado", type_raw: "Serviço", assigned: "" },
  { requester_name: "Daniela", base_name: "221184 - MULTIPLUS", created_at_raw: "2/2/26", finished_at_raw: "2/3/26", execution_time: "08:42", status_raw: "Concluido", type_raw: "Produtos", assigned: "André" },
  { requester_name: "Adonias", base_name: "205192 - Ar Vix", created_at_raw: "2/2/26", finished_at_raw: "2/2/26", execution_time: "00:33", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Jullia", base_name: "221736 - Visiocam", created_at_raw: "2/2/26", finished_at_raw: "2/3/26", execution_time: "01:10", status_raw: "Concluido", type_raw: "Clientes/Fornecedores", assigned: "André" },
  { requester_name: "Adonias", base_name: "209367 - A Predial Engenharia de Manutencao", created_at_raw: "2/2/26", finished_at_raw: "2/2/26", execution_time: "00:28", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Marianna", base_name: "221475 - Grupo Os Manutencoes", created_at_raw: "2/2/26", finished_at_raw: "2/3/26", execution_time: "03:41", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "querino", base_name: "219347 - J.A piscinas", created_at_raw: "2/2/26", finished_at_raw: "03/02/2026 09:36:00", execution_time: "05:17", status_raw: "Concluido", type_raw: "Tarefas", assigned: "André" },
  { requester_name: "Daniela", base_name: "221340 - FERNANDO PEREIRA GRUHN", created_at_raw: "2/3/26", finished_at_raw: "2/3/26", execution_time: "01:31", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Marianna", base_name: "220669 - Mary Móveis Planejados", created_at_raw: "2/3/26", finished_at_raw: "2/3/26", execution_time: "01:05", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Silva", base_name: "212188 - Amj Security Fire", created_at_raw: "2/3/26", finished_at_raw: "2/3/26", execution_time: "03:02", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Janaina", base_name: "213641 - CLIMATEC AR CONDICION", created_at_raw: "2/3/26", finished_at_raw: "2/3/26", execution_time: "03:29", status_raw: "Concluido", type_raw: "Cliente/Equipamentos", assigned: "André" },
  { requester_name: "jullia", base_name: "220609 - NOW QUIMICA", created_at_raw: "2/3/26", finished_at_raw: "2/3/26", execution_time: "01:28", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Monique", base_name: "217014 - Tech Frio Refrigeracao e Eletrica", created_at_raw: "2/3/26", finished_at_raw: "2/4/26", execution_time: "01:05", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Daniela", base_name: "218893 - PlanVolt", created_at_raw: "2/3/26", finished_at_raw: "2/4/26", execution_time: "01:55", status_raw: "Concluido", type_raw: "Produtos", assigned: "André" },
  { requester_name: "Daniela", base_name: "221677 - Omega Manutencao Eletrica", created_at_raw: "2/3/26", finished_at_raw: "2/4/26", execution_time: "03:02", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Janine", base_name: "221084 - BHIO SERVICE COMPONENTES DE PRECISAO", created_at_raw: "2/4/26", finished_at_raw: "2/4/26", execution_time: "02:36", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Janine", base_name: "221084 - BHIO SERVICE COMPONENTES DE PRECISAO", created_at_raw: "2/4/26", finished_at_raw: "", execution_time: "", status_raw: "Cancelado", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Daniela", base_name: "221710 - RIBEIRO COMBATE A INCENDIO", created_at_raw: "2/4/26", finished_at_raw: "2/4/26", execution_time: "00:55", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Guilherme", base_name: "218641 - COMSEG", created_at_raw: "2/4/26", finished_at_raw: "2/5/26", execution_time: "03:03", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Marianna", base_name: "Ss Servicos & Tecnologia", created_at_raw: "2/4/26", finished_at_raw: "2/5/26", execution_time: "03:40", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Daniela", base_name: "221595 - Simples Limpeza Inteligente", created_at_raw: "2/4/26", finished_at_raw: "2/5/26", execution_time: "06:14", status_raw: "Concluido", type_raw: "Tarefas", assigned: "André" },
  { requester_name: "Daniela", base_name: "221595 - Simples Limpeza Inteligente", created_at_raw: "2/4/26", finished_at_raw: "2/5/26", execution_time: "04:09", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Janine", base_name: "221808 - Henrique & Deyvid - Refrigeração, Lda", created_at_raw: "2/5/26", finished_at_raw: "2/5/26", execution_time: "01:05", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Silva", base_name: "221770 - Lemospassos", created_at_raw: "2/5/26", finished_at_raw: "2/6/26", execution_time: "04:36", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Thayane", base_name: "221609 - Alto Vale Empilhadeiras", created_at_raw: "2/5/26", finished_at_raw: "2/5/26", execution_time: "01:46", status_raw: "Concluido", type_raw: "Produtos/Clientes", assigned: "André" },
  { requester_name: "Adonias", base_name: "209909 - BUCKLER GROUP LTDA", created_at_raw: "2/6/26", finished_at_raw: "2/6/26", execution_time: "01:56", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Jullia", base_name: "221736 - Visiocam", created_at_raw: "2/6/26", finished_at_raw: "2/6/26", execution_time: "01:47", status_raw: "Concluido", type_raw: "Produtos", assigned: "André" },
  { requester_name: "Leonardo Boeira", base_name: "195409 - Otimize Climatização E Elétrica + Reativação", created_at_raw: "2/6/26", finished_at_raw: "2/9/26", execution_time: "09:45", status_raw: "Concluido", type_raw: "Cliente/Equipamentos", assigned: "André" },
  { requester_name: "Janine", base_name: "221960 - Multi Fone", created_at_raw: "2/6/26", finished_at_raw: "2/6/26", execution_time: "05:43", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Daniela", base_name: "219256 - BREEZIFY AR-CONDICIONADO", created_at_raw: "2/6/26", finished_at_raw: "2/9/26", execution_time: "08:53", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Jullia", base_name: "219181 - Top Services", created_at_raw: "2/6/26", finished_at_raw: "06/02/2026 16:27:00", execution_time: "05:08", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Jullia", base_name: "221628 - Brbull", created_at_raw: "2/6/26", finished_at_raw: "12/02/2026 11:38:52", execution_time: "08:52", status_raw: "Concluido", type_raw: "Cliente/Equipamentos", assigned: "André" },
  { requester_name: "Jullia", base_name: "105918 - Climatec Refrigeração", created_at_raw: "2/6/26", finished_at_raw: "2/6/26", execution_time: "04:42", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Gustavo Gomes", base_name: "211889 - Milenio", created_at_raw: "2/6/26", finished_at_raw: "09/02/2026 15:58:26", execution_time: "09:56", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "GUIlherme", base_name: "221898 - TIAGO MICHELLON CARDOSO", created_at_raw: "2/9/26", finished_at_raw: "2/9/26", execution_time: "00:54", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Daniela", base_name: "221264 - Housetech Solucoes Inteligentes", created_at_raw: "2/9/26", finished_at_raw: "2/9/26", execution_time: "01:00", status_raw: "Concluido", type_raw: "Produtos/Clientes", assigned: "André" },
  { requester_name: "Silva", base_name: "221195 - Benit", created_at_raw: "2/9/26", finished_at_raw: "09/02/2026 11:59:17", execution_time: "01:11", status_raw: "Concluido", type_raw: "Colaboradores", assigned: "André" },
  { requester_name: "Daniela", base_name: "222074 - BF Climatização", created_at_raw: "2/9/26", finished_at_raw: "09/02/2026 16:23:38", execution_time: "00:25", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "jullia", base_name: "219181 - Top Services", created_at_raw: "2/9/26", finished_at_raw: "", execution_time: "", status_raw: "Cancelado", type_raw: "", assigned: "André" },
  { requester_name: "Daniela", base_name: "221595 - Simples Limpeza Inteligente", created_at_raw: "2/9/26", finished_at_raw: "09/02/2026 16:32:28", execution_time: "00:21", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "jullia", base_name: "222357 GS INSTALACOES E MANUTENCOES ELETRICAS", created_at_raw: "2/9/26", finished_at_raw: "09/02/2026 17:15:37", execution_time: "00:51", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Adonias", base_name: "202579 - SOTER CONSULTORIA AR CONDICIONADO E ELETRICA PREDIAL", created_at_raw: "2/10/26", finished_at_raw: "10/02/2026 11:00:43", execution_time: "01:09", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Marianna", base_name: "221531 - Solutionnair", created_at_raw: "2/10/26", finished_at_raw: "10/02/2026 13:55:52", execution_time: "00:20", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "QUERINO", base_name: "220485 - ELETRO E REFRIGERACAO VIVAN", created_at_raw: "2/10/26", finished_at_raw: "10/02/2026 14:12:55", execution_time: "00:33", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "QUERINO", base_name: "221835 - Elev Plus Elevadores", created_at_raw: "2/10/26", finished_at_raw: "10/02/2026 16:45:25", execution_time: "03:05", status_raw: "Concluido", type_raw: "Colaborador/Clientes/Produtos", assigned: "André" },
  { requester_name: "QUERINO", base_name: "221847 - ATUAL ELEVADORES MANUTENCAO LIMITADA", created_at_raw: "2/10/26", finished_at_raw: "10/02/2026 17:13:16", execution_time: "03:34", status_raw: "Concluido", type_raw: "Colaborador/Clientes/Produtos", assigned: "André" },
  { requester_name: "Adonias", base_name: "202692 - Tensoflex", created_at_raw: "2/10/26", finished_at_raw: "12/02/2026 17:30:30", execution_time: "10:17", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "GUIlherme", base_name: "221789 - Alg Comercio", created_at_raw: "2/10/26", finished_at_raw: "10/02/2026 15:04:40", execution_time: "00:55", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "querino", base_name: "218307 - Unigera Solucoes em Energia Ltda", created_at_raw: "2/10/26", finished_at_raw: "10/02/2026 16:10:16", execution_time: "01:50", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "querino", base_name: "221768 - Equipacare", created_at_raw: "2/10/26", finished_at_raw: "11/02/2026 08:20:18", execution_time: "03:07", status_raw: "Concluido", type_raw: "Outros- colocar obs", assigned: "André" },
  { requester_name: "Silva", base_name: "221889 - Roche Serviços", created_at_raw: "2/10/26", finished_at_raw: "11/02/2026 09:52:40", execution_time: "03:55", status_raw: "Concluido", type_raw: "Cliente\\ Questionário", assigned: "André" },
  { requester_name: "Janine", base_name: "219784 - Engepredial Engenharia de Prevencao Contra Incendio", created_at_raw: "2/10/26", finished_at_raw: "11/02/2026 14:04:18", execution_time: "07:54", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Janine", base_name: "216567 - ALT GRUAS", created_at_raw: "2/10/26", finished_at_raw: "", execution_time: "", status_raw: "Aguardando Cliente/ISM", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Silva", base_name: "222172 - ATA SERVICE", created_at_raw: "2/10/26", finished_at_raw: "11/02/2026 15:08:34", execution_time: "09:59", status_raw: "Concluido", type_raw: "Colaboradores", assigned: "André" },
  { requester_name: "Marianna", base_name: "221475 - Grupo Os Manutencoes", created_at_raw: "2/11/26", finished_at_raw: "11/02/2026 15:53:15", execution_time: "07:53", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Guilherme", base_name: "219452 - TREMBAO", created_at_raw: "2/11/26", finished_at_raw: "11/02/2026 16:10:27", execution_time: "08:10", status_raw: "Concluido", type_raw: "Tarefas", assigned: "André" },
  { requester_name: "Jullia", base_name: "221905 - Ponto Acústico Produções e Eventos", created_at_raw: "2/11/26", finished_at_raw: "11/02/2026 16:57:01", execution_time: "05:13", status_raw: "Concluido", type_raw: "Produtos/Clientes", assigned: "André" },
  { requester_name: "Silva", base_name: "222422 - AGK AR CONDICIONADO", created_at_raw: "2/11/26", finished_at_raw: "12/02/2026 13:42:40", execution_time: "09:59", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Marianna", base_name: "222907 - D'graus Decor", created_at_raw: "2/11/26", finished_at_raw: "12/02/2026 15:50:20", execution_time: "09:59", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Janaina", base_name: "213641 - CLIMATEC AR CONDICION", created_at_raw: "2/12/26", finished_at_raw: "13/02/2026 10:18:09", execution_time: "05:15", status_raw: "Concluido", type_raw: "Cliente/Equipamentos", assigned: "André" },
  { requester_name: "GUIlherme", base_name: "222665 - Lw Compressores", created_at_raw: "2/12/26", finished_at_raw: "12/02/2026 17:50:11", execution_time: "03:18", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Janaina", base_name: "218937 - Sie Engenharia", created_at_raw: "2/12/26", finished_at_raw: "13/02/2026 09:17:32", execution_time: "10:00", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Daniela", base_name: "222326 - Sw Prevencao Contra Incendio", created_at_raw: "2/12/26", finished_at_raw: "13/02/2026 09:38:34", execution_time: "02:32", status_raw: "Concluido", type_raw: "Cliente\\ Questionário", assigned: "André" },
  { requester_name: "Adonias", base_name: "222526 - Schellin Refrigeração", created_at_raw: "2/13/26", finished_at_raw: "13/02/2026 15:16:42", execution_time: "03:52", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "GUIlherme", base_name: "221904 Fermar", created_at_raw: "2/13/26", finished_at_raw: "13/02/2026 15:08:21", execution_time: "03:19", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Jullia", base_name: "221895 - LIMPA FOSSA GUGUE XAN", created_at_raw: "2/14/26", finished_at_raw: "18/02/2026 09:52:31", execution_time: "01:52", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Jullia", base_name: "220609 - NOW QUIMICA INDUSTRIA E COMERCIO LTDA", created_at_raw: "2/17/26", finished_at_raw: "", execution_time: "", status_raw: "Aguardando Cliente/ISM", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Jullia", base_name: "220835 - Foccus Assistencia", created_at_raw: "2/17/26", finished_at_raw: "18/02/2026 10:47:48", execution_time: "02:46", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Jullia", base_name: "219181 - Top Services", created_at_raw: "2/17/26", finished_at_raw: "19/02/2026 10:51:50", execution_time: "07:37", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Jullia", base_name: "221905 - Ponto Acustico Producoes e Eventos", created_at_raw: "2/17/26", finished_at_raw: "", execution_time: "", status_raw: "Aguardando Cliente/ISM", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "GUIlherme", base_name: "222014 - Pontual Elevadores", created_at_raw: "2/18/26", finished_at_raw: "18/02/2026 11:14:23", execution_time: "03:00", status_raw: "Concluido", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Marianna", base_name: "222903 - BELTRAO COMERCIO DE REFRIGERACAO", created_at_raw: "2/18/26", finished_at_raw: "18/02/2026 13:56:03", execution_time: "04:20", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "querino", base_name: "220914 - Mpr Eletronica de Potencia", created_at_raw: "2/18/26", finished_at_raw: "18/02/2026 14:06:17", execution_time: "03:29", status_raw: "Concluido", type_raw: "Colaboradores/Clientes", assigned: "André" },
  { requester_name: "Silva", base_name: "186063 - Agesp", created_at_raw: "2/18/26", finished_at_raw: "19/02/2026 10:03:30", execution_time: "09:25", status_raw: "Concluido", type_raw: "Outros- colocar obs", assigned: "André" },
  { requester_name: "Daniela", base_name: "223025 - Vert Service", created_at_raw: "2/18/26", finished_at_raw: "18/02/2026 15:57:58", execution_time: "04:46", status_raw: "Concluido", type_raw: "Produto/Questionário", assigned: "André" },
  { requester_name: "Jullia", base_name: "223003 - Tecnofrio Gravatai", created_at_raw: "2/18/26", finished_at_raw: "19/02/2026 14:41:32", execution_time: "16:41", status_raw: "Concluido", type_raw: "Equipamentos/Questionarios", assigned: "André" },
  { requester_name: "querino", base_name: "218307 - Unigera Solucoes em Energia Ltda", created_at_raw: "2/18/26", finished_at_raw: "18/02/2026 14:20:57", execution_time: "00:56", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "GUIlherme", base_name: "223235 - LOXAM DO BRASIL", created_at_raw: "2/18/26", finished_at_raw: "19/02/2026 15:39:41", execution_time: "10:32", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Janaina", base_name: "218937 - Sie Engenharia", created_at_raw: "2/18/26", finished_at_raw: "19/02/2026 16:39:02", execution_time: "09:41", status_raw: "Concluido", type_raw: "Quest/pmoc", assigned: "André" },
  { requester_name: "Janaina", base_name: "218938 - Sie Engenharia", created_at_raw: "2/18/26", finished_at_raw: "19/02/2026 16:39:06", execution_time: "09:59", status_raw: "Concluido", type_raw: "Cliente/Equipamentos", assigned: "André" },
  { requester_name: "Janine", base_name: "221886 - Renovagas", created_at_raw: "2/18/26", finished_at_raw: "20/02/2026 09:22:48", execution_time: "11:22", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Jullia", base_name: "223003 - Tecnofrio Gravatai", created_at_raw: "2/19/26", finished_at_raw: "20/02/2026 10:03:52", execution_time: "11:13", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Marianna", base_name: "222845 - Inovabrus Refrigeracao", created_at_raw: "2/19/26", finished_at_raw: "20/02/2026 10:26:50", execution_time: "11:17", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Silva", base_name: "215291 - COOL SEED", created_at_raw: "2/19/26", finished_at_raw: "20/02/2026 11:50:27", execution_time: "11:56", status_raw: "Concluido", type_raw: "Colaboradores/Clientes", assigned: "André" },
  { requester_name: "querino", base_name: "218497 - Duarte Cranes Equipamentos de Elevacao de Cargas", created_at_raw: "2/19/26", finished_at_raw: "23/02/2026 08:04:56", execution_time: "13:33", status_raw: "Concluido", type_raw: "Questionários", assigned: "André" },
  { requester_name: "QUERINO", base_name: "220235 - CN Servicos", created_at_raw: "2/19/26", finished_at_raw: "", execution_time: "", status_raw: "Em andamento", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Marianna", base_name: "222220 - Intrepid Industrial Importadora", created_at_raw: "2/19/26", finished_at_raw: "20/02/2026 17:50:49", execution_time: "11:33", status_raw: "Concluido", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Thayane", base_name: "223028 - M5 Servicos", created_at_raw: "2/19/26", finished_at_raw: "", execution_time: "", status_raw: "Em andamento", type_raw: "Cliente", assigned: "André" },
  { requester_name: "Jullia", base_name: "223256 - BERNOULLI SISTEMAS DE CLIMATIZACAO", created_at_raw: "2/19/26", finished_at_raw: "", execution_time: "", status_raw: "Não iniciado", type_raw: "Equipamento", assigned: "André" },
  { requester_name: "Jullia", base_name: "223467 - AD TEC FACILITIES", created_at_raw: "2/19/26", finished_at_raw: "", execution_time: "", status_raw: "Não iniciado", type_raw: "Questionários", assigned: "André" },
  { requester_name: "Guilherme", base_name: "223235 - LOXAM DO BRASIL", created_at_raw: "2/20/26", finished_at_raw: "20/02/2026 10:16:54", execution_time: "00:28", status_raw: "Concluido", type_raw: "Equipamento", assigned: "" },
];

const BulkImport: React.FC = () => {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ successCount: number; errorCount: number; errors: string[] } | null>(null);
  const { toast } = useToast();

  const processedData = RAW_DATA.map((r) => ({
    requester_name: r.requester_name,
    base_name: r.base_name,
    created_at: parseDate(r.created_at_raw),
    finished_at: parseDate(r.finished_at_raw),
    execution_time: r.execution_time,
    status: mapStatus(r.status_raw),
    type: mapType(r.type_raw || "outro"),
    assigned_analyst_id: r.assigned ? ANDRE_ID : null,
  }));

  const handleImport = async () => {
    if (imported) {
      toast({ title: "Importação já realizada", description: "Os dados já foram importados.", variant: "destructive" });
      return;
    }

    setImporting(true);
    setProgress(10);

    try {
      // Split into batches of 20
      const batchSize = 20;
      const batches = [];
      for (let i = 0; i < processedData.length; i += batchSize) {
        batches.push(processedData.slice(i, i + batchSize));
      }

      let totalSuccess = 0;
      let totalError = 0;
      const allErrors: string[] = [];

      for (let i = 0; i < batches.length; i++) {
        setProgress(10 + Math.round((i / batches.length) * 80));

        const { data, error } = await supabase.functions.invoke('bulk-import-tickets', {
          body: { tickets: batches[i] },
        });

        if (error) {
          allErrors.push(`Batch ${i + 1}: ${error.message}`);
          totalError += batches[i].length;
        } else if (data) {
          totalSuccess += data.successCount || 0;
          totalError += data.errorCount || 0;
          if (data.errors) allErrors.push(...data.errors);
        }
      }

      setProgress(100);
      setResult({ successCount: totalSuccess, errorCount: totalError, errors: allErrors });
      setImported(true);

      toast({
        title: "Importação concluída",
        description: `${totalSuccess} tickets importados com sucesso. ${totalError} erros.`,
      });
    } catch (err) {
      toast({ title: "Erro na importação", description: (err as Error).message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Importação em Massa - Fevereiro 2026</h1>
          <p className="text-muted-foreground">Importar {RAW_DATA.length} registros da planilha para o sistema</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumo dos Dados</CardTitle>
            <CardDescription>Dados extraídos da aba "Fevereiro2026" da planilha</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-2xl font-bold">{RAW_DATA.length}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-2xl font-bold">{RAW_DATA.filter(r => mapStatus(r.status_raw) === 'finalizado').length}</div>
                <div className="text-xs text-muted-foreground">Finalizados</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-2xl font-bold">{RAW_DATA.filter(r => mapStatus(r.status_raw) === 'pausado').length}</div>
                <div className="text-xs text-muted-foreground">Pausados</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <div className="text-2xl font-bold">{RAW_DATA.filter(r => ['em_andamento', 'nao_iniciado'].includes(mapStatus(r.status_raw))).length}</div>
                <div className="text-xs text-muted-foreground">Em aberto</div>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">Solicitante</th>
                    <th className="text-left p-2">Base</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {RAW_DATA.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{r.requester_name}</td>
                      <td className="p-2 max-w-[200px] truncate">{r.base_name}</td>
                      <td className="p-2"><Badge variant="outline" className="text-[10px]">{mapType(r.type_raw || "outro")}</Badge></td>
                      <td className="p-2"><Badge variant="secondary" className="text-[10px]">{mapStatus(r.status_raw)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {importing && (
          <Card>
            <CardContent className="py-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Importando...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card>
            <CardContent className="py-6 space-y-3">
              <div className="flex items-center gap-2">
              {result.errorCount === 0 ? (
                  <CheckCircle className="h-5 w-5 text-primary" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-medium">
                  {result.successCount} importados com sucesso, {result.errorCount} erros
                </span>
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto bg-destructive/10 p-3 rounded text-xs">
                  {result.errors.map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Button
          onClick={handleImport}
          disabled={importing || imported}
          className="w-full"
          size="lg"
        >
          <Upload className="h-4 w-4 mr-2" />
          {imported ? 'Importação Concluída' : importing ? 'Importando...' : `Importar ${RAW_DATA.length} Registros`}
        </Button>
      </div>
    </AppLayout>
  );
};

export default BulkImport;
