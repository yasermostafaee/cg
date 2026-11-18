/** One transparency backdrop for the authoring page and the project-sized Preview. */
export const previewCheckerboard = {
  backgroundColor: '#3d4253',
  backgroundImage:
    'linear-gradient(45deg, #5b6075 25%, transparent 25%),' +
    'linear-gradient(-45deg, #5b6075 25%, transparent 25%),' +
    'linear-gradient(45deg, transparent 75%, #5b6075 75%),' +
    'linear-gradient(-45deg, transparent 75%, #5b6075 75%)',
  backgroundSize: '48px 48px',
  backgroundPosition: '0 0, 0 24px, 24px -24px, -24px 0',
} as const;
