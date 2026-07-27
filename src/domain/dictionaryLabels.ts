/**
 * Oxford marks a sense with usage labels that change how a learner should read it.
 * Only the closed set of register, tone, and dialect labels is localized; subject-field
 * labels stay in their published English form.
 */
const USAGE_LABELS: Record<string, string> = {
  informal: '非正式',
  formal: '正式',
  figurative: '比喻',
  literal: '字面',
  literary: '文学',
  dated: '旧式',
  archaic: '古旧',
  derogatory: '贬义',
  humorous: '幽默',
  ironic: '反语',
  euphemistic: '委婉',
  affectionate: '亲昵',
  offensive: '冒犯',
  vulgar: '粗俗',
  slang: '俚语',
  technical: '术语',
  rare: '罕见',
  dialect: '方言',
  proprietary: '商标',
  British: '英式',
  US: '美式',
  Australian: '澳式',
  Canadian: '加式',
  Scottish: '苏格兰',
  Irish: '爱尔兰',
  'New Zealand': '新西兰',
  'South African': '南非',
  Indian: '印度英语',
};

export function localizeUsageLabel(label: string): string {
  return USAGE_LABELS[label.trim()] ?? label.trim();
}
