import { describe, expect, it } from 'vitest';
import { effectiveCatalog } from '../catalog';
import { createEmptyDoc } from '../schema';
import { saasApp } from '../templates';
import { terraformFiles } from './terraform';

const catalog = effectiveCatalog();
const file = (doc: ReturnType<typeof saasApp>, path: string) =>
  terraformFiles(doc, catalog).find((f) => f.path === path)!.content;

describe('Terraform export', () => {
  it('gives each cloud component its AWS resource with the required arguments', () => {
    const tf = file(saasApp(), 'terraform/main.tf');
    for (const r of [
      'resource "aws_lb" "edge"',
      'resource "aws_ecs_service" "api"',
      'resource "aws_ecs_service" "worker"',
      'resource "aws_db_instance" "db"',
      'resource "aws_elasticache_cluster" "sessions"',
      'resource "aws_sqs_queue" "jobs"',
    ])
      expect(tf).toContain(r);
    expect(tf).toContain('engine                      = "postgres"');
    expect(tf).toContain('allocated_storage           = 50');
    // One cluster for every service, declared once.
    expect(tf.match(/resource "aws_ecs_cluster"/g)).toHaveLength(1);
    expect(tf).toContain('source  = "hashicorp/aws"');
  });

  it('leaves out what runs elsewhere and says what it could not map', () => {
    const doc = saasApp();
    doc.nodes.find((n) => n.id === 'jobs')!.deploy = { target: 'docker' };
    doc.nodes.find((n) => n.id === 'db')!.props.engine = 'MongoDB';
    const tf = file(doc, 'terraform/main.tf');
    expect(tf).not.toContain('aws_sqs_queue');
    expect(tf).not.toContain('aws_db_instance');
    expect(tf).toContain('#   Uygulama veritabanı: no RDS engine for MongoDB');
  });

  it('names the project in the variables and writes nothing without cloud parts', () => {
    expect(file(saasApp(), 'terraform/variables.tf')).toContain('default     = "saas-uygulamasi"');
    expect(terraformFiles(createEmptyDoc('Boş'), catalog)).toEqual([]);
  });
});
