function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** 列表里的时间：今天显示时分，昨天显示「昨天」，一周内显示星期，然后显示日期。 */
export function formatNoteTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  if (timestamp >= startOfToday) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  if (timestamp >= startOfYesterday) {
    return '昨天';
  }
  if (now.getTime() - timestamp < 7 * 86_400_000) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
