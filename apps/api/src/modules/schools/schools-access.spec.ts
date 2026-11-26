import { schoolAccessIdentifierSchema } from '@schoolhub/shared';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { SchoolsService } from './schools.service.js';

describe('public school access lookup', () => {
  it('looks up the exact indexed code and subdomain and allows a collision to be selected', async () => {
    const rows = [
      { name: 'Public School', code: 'PUBLIC', subdomain: 'second' },
      { name: 'Second School', code: 'ALT', subdomain: 'public' },
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const service = new SchoolsService({
      client: { school: { findMany } },
    } as unknown as PrismaService);
    const result = await service.findSchoolsForAccess(
      schoolAccessIdentifierSchema.parse('  PUBLIC '),
    );
    expect(result).toEqual(rows);
    expect(findMany).toHaveBeenCalledWith({
      where: { OR: [{ code: 'PUBLIC' }, { subdomain: 'public' }] },
      select: {
        name: true,
        subdomain: true,
        code: true,
        logo: true,
        primaryColor: true,
        secondaryColor: true,
      },
      orderBy: { subdomain: 'asc' },
      take: 2,
    });
  });

  it.each(['', 'school name', 'a/b', 'a?b', 'x'.repeat(64)])(
    'rejects invalid input %s',
    (value) => {
      expect(schoolAccessIdentifierSchema.safeParse(value).success).toBe(false);
    },
  );
});
