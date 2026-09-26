import http from "http"
import { describe, expect, it } from "bun:test"
import { startDeviceServer } from "./device-server"
import type { WdaSession } from "./wda"

const session = {
  device: { udid: "test-device", name: "iPhone", productType: "iPhone", productVersion: "27" },
  getWindowSize: () => ({ width: 400, height: 800 }),
} as WdaSession

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = ""
        response.on("data", (chunk) => (body += chunk.toString()))
        response.on("end", () => resolve({ status: response.statusCode || 0, body }))
      })
      .on("error", reject)
  })
}

describe("physical iOS preview", () => {
  it("requires its session token for all routes", async () => {
    const server = await startDeviceServer({ session, port: 0, token: "test-token" })
    try {
      const unauthorized = await get(server.url.replace("?token=test-token", "health"))
      const authorized = await get(new URL("/health?token=test-token", server.url).href)
      expect(unauthorized.status).toBe(403)
      expect(authorized.status).toBe(200)
      expect(JSON.parse(authorized.body)).toEqual({ status: "ok", device: "test-device" })
    } finally {
      await server.stop()
    }
  })
})
