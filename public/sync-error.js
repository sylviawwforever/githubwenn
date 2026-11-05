/* 云端同步错误：未登录 / 过期 / 离线都不要当成「读取失败」弹窗 */
function isAuthExpiredError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.status === 401 || /未登录|登录已过期/.test(msg);
}

function shouldToastSyncError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  if (isAuthExpiredError(err)) return false;
  if (msg === 'OFFLINE' || /后端未连接/.test(msg)) return false;
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isAuthExpiredError, shouldToastSyncError };
}
