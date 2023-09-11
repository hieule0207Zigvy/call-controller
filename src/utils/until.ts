export const getUniqConferenceName = () => {
  return `conference-${(Math.random() + 1).toString(36).substring(7)}`;
};
