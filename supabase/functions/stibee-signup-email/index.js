import { sendSignupEmail } from "./handler.ts";

Deno.serve(request => sendSignupEmail(request, name => Deno.env.get(name)));
