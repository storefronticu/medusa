import Scrypt from "scrypt-kdf"

import { AuthUserService } from "@services"
import {
  AbstractAuthenticationModuleProvider,
  AuthenticationResponse,
} from "@medusajs/types"

class UsernamePasswordProvider extends AbstractAuthenticationModuleProvider {
  public static PROVIDER = "usernamePassword"
  public static DISPLAY_NAME = "Username/Password Authentication"

  protected readonly authUserSerivce_: AuthUserService

  constructor({ authUserService: AuthUserService }) {
    super()

    this.authUserSerivce_ = AuthUserService
  }

  async authenticate(
    userData: Record<string, unknown>
  ): Promise<AuthenticationResponse> {
    const { email, password } = userData

    if (typeof password !== "string") {
      return {
        success: false,
        error: "Password should be a string",
      }
    }

    if (typeof email !== "string") {
      return {
        success: false,
        error: "Email should be a string",
      }
    }

    const [authUser] = await this.authUserSerivce_.list({
      provider_metadata: {
        email,
      },
    })

    const password_hash = authUser.provider_metadata?.password_hash

    if (password_hash && typeof password_hash === "string") {
      const buf = Buffer.from(password_hash, "base64")

      const success = await Scrypt.verify(buf, password)

      if (success) {
        return { success, authUser: JSON.parse(JSON.stringify(authUser)) }
      }
    }

    return {
      success: false,
      error: "Invalid email or password",
    }
  }
}

export default UsernamePasswordProvider
