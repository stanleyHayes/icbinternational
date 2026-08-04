import { checkPlaceholders, placeholdersIn, renderPreview } from './placeholders';

describe('placeholdersIn', () => {
  it('finds each placeholder once, in the order it is first used', () => {
    const body = 'Hello {{firstName}}, {{amount}} left {{accountName}}. Thanks, {{firstName}}.';
    expect(placeholdersIn(body)).toEqual(['firstName', 'amount', 'accountName']);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(placeholdersIn('{{ firstName }}')).toEqual(['firstName']);
  });

  it('finds nothing in a template with no placeholders', () => {
    expect(placeholdersIn('Your statement is ready.')).toEqual([]);
  });
});

describe('checkPlaceholders', () => {
  it('passes when the body and the declared values agree exactly', () => {
    const report = checkPlaceholders('Hi {{firstName}}', ['firstName']);
    expect(report.ok).toBe(true);
  });

  it('flags a placeholder the engine would not supply', () => {
    const report = checkPlaceholders('Hi {{firstName}} of {{branchName}}', ['firstName']);
    expect(report.undeclared).toEqual(['branchName']);
    expect(report.ok).toBe(false);
  });

  it('flags a declared value the body never uses', () => {
    const report = checkPlaceholders('Hi {{firstName}}', ['firstName', 'amount']);
    expect(report.unused).toEqual(['amount']);
    expect(report.ok).toBe(false);
  });
});

describe('renderPreview', () => {
  it('substitutes sample values so the sentence can be read', () => {
    expect(renderPreview('Hi {{firstName}}, you paid {{amount}}.')).toBe(
      'Hi Amara, you paid £248.60.',
    );
  });

  it('names an unknown placeholder rather than leaving braces on screen', () => {
    expect(renderPreview('Ref {{unknownThing}}')).toBe('Ref [unknownThing]');
  });
});
