import { describe, it, expect } from 'vitest';
import { applyDeterministicRepairs } from './deterministicRepair';

describe('applyDeterministicRepairs', () => {
  it('strips type="module" from <script> tags in HTML', () => {
    const { files, applied } = applyDeterministicRepairs([
      { relativePath: 'index.html', content: '<html><head></head><body><script type="module" src="js/main.js"></script></body></html>' }
    ]);
    expect(files[0].content).not.toContain('type="module"');
    expect(applied).toContain('index.html: stripped type="module" from <script>');
  });

  it('strips single-quoted module scripts too', () => {
    const { files } = applyDeterministicRepairs([
      { relativePath: 'index.html', content: "<script type='module'>import x from './a.js'</script>" }
    ]);
    expect(files[0].content).not.toContain("type='module'");
    expect(files[0].content).toContain('import x from');
  });

  it('injects the Tailwind CDN when class attributes are present but no CDN', () => {
    const { files, applied } = applyDeterministicRepairs([
      { relativePath: 'index.html', content: '<html><head></head><body><div class="flex p-4"></div></body></html>' }
    ]);
    expect(files[0].content).toContain('cdn.tailwindcss.com');
    expect(applied).toContain('index.html: injected Tailwind CDN script');
  });

  it('does not inject the Tailwind CDN when it is already present', () => {
    const { files, applied } = applyDeterministicRepairs([
      {
        relativePath: 'index.html',
        content: '<html><head><script src="https://cdn.tailwindcss.com"></script></head><body><div class="flex"></div></body></html>'
      }
    ]);
    expect(applied.filter(a => a.includes('Tailwind')).length).toBe(0);
    expect(files[0].content).toContain('cdn.tailwindcss.com');
  });

  it('does not inject the Tailwind CDN into pages without class attributes', () => {
    const { applied } = applyDeterministicRepairs([
      { relativePath: 'index.html', content: '<html><head></head><body><p>plain</p></body></html>' }
    ]);
    expect(applied.filter(a => a.includes('Tailwind')).length).toBe(0);
  });

  it('leaves non-HTML files untouched', () => {
    const original = 'import { x } from "y";';
    const { files, applied } = applyDeterministicRepairs([
      { relativePath: 'src/main.js', content: original }
    ]);
    expect(files[0].content).toBe(original);
    expect(applied).toEqual([]);
  });

  it('applies both fixes on a single bad HTML file', () => {
    const { files, applied } = applyDeterministicRepairs([
      { relativePath: 'index.html', content: '<html><head></head><body><script type="module" src="a.js"></script><div class="flex"></div></body></html>' }
    ]);
    expect(applied.length).toBe(2);
    expect(files[0].content).not.toContain('type="module"');
    expect(files[0].content).toContain('cdn.tailwindcss.com');
  });
});
