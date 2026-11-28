import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SchoolsPublicController } from './schools-public.controller.js';
import type { SchoolsService } from './schools.service.js';
import { MAX_IMAGE_BYTES } from '../storage/image-validation.js';
import type { R2Service } from '../storage/r2.service.js';

vi.mock('../storage/r2.service.js', () => ({ R2Service: class {} }));

describe('public school branding', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function setup(key: string | null, bytes = png) {
    const lookup = vi.fn().mockResolvedValue({ id: 'school-a', logo: 'https://assets.test/logo' });
    const read = vi.fn().mockResolvedValue(bytes);
    const schools = { getPublicSchoolBySubdomain: lookup } as unknown as SchoolsService;
    const r2 = {
      read,
      keyFromUrl: vi.fn().mockReturnValue(key),
      keys: { schoolPrefix: (id: string) => `schools/${id}/` },
    } as unknown as R2Service;
    return { controller: new SchoolsPublicController(schools, r2), lookup, read };
  }

  it('serves a real image type from the matching school logo folder', async () => {
    const key = 'schools/school-a/images/logo/approved.png';
    const { controller, lookup, read } = setup(key);
    const logo = await controller.getPublicSchoolLogo('school-a');
    expect(lookup).toHaveBeenCalledWith('school-a');
    expect(read).toHaveBeenCalledWith(key, MAX_IMAGE_BYTES);
    expect(logo.getHeaders()).toMatchObject({ type: 'image/png', disposition: 'inline' });
  });

  it.each([null, 'schools/school-b/images/logo/other.png', 'schools/school-a/files/private.png'])(
    'refuses an unowned or non-logo object %s without reading it',
    async (key) => {
      const { controller, read } = setup(key);
      await expect(controller.getPublicSchoolLogo('school-a')).rejects.toBeInstanceOf(NotFoundException);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('refuses responses that cannot be identified as an image', async () => {
    const { controller } = setup('schools/school-a/images/logo/old.png', Buffer.from('<html>'));
    await expect(controller.getPublicSchoolLogo('school-a')).rejects.toBeInstanceOf(NotFoundException);
  });
});
