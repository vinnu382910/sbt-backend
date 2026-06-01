const TOKEN_COOKIE_NAME = "token";

const isLocalOrigin = (origin = "") =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

const isHttpsRequest = (req) => {
  const origin = String(req?.headers?.origin || "");
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "");
  return (
    process.env.NODE_ENV === "production" ||
    req?.secure ||
    forwardedProto.split(",").map((item) => item.trim()).includes("https") ||
    origin.startsWith("https://")
  );
};

const getCookieOptions = (req) => {
  const origin = String(req?.headers?.origin || "");
  const shouldUseCrossSiteCookie = isHttpsRequest(req) && !isLocalOrigin(origin);

  return {
    httpOnly: true,
    secure: shouldUseCrossSiteCookie,
    sameSite: shouldUseCrossSiteCookie ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
};

const setAuthCookie = (res, token, req) => {
  res.cookie(TOKEN_COOKIE_NAME, token, getCookieOptions(req));
};

const clearAuthCookie = (res, req) => {
  res.clearCookie(TOKEN_COOKIE_NAME, {
    ...getCookieOptions(req),
    maxAge: 0,
  });
};

module.exports = {
  TOKEN_COOKIE_NAME,
  getCookieOptions,
  setAuthCookie,
  clearAuthCookie,
};
