# Security

## Reporting a problem

If you find a security problem in RBAi Scholar (the service at `scholar.thedreamlabinnovations.com`, its sign-in,
or anything in this repository), please tell us privately rather than in a public issue.

Use GitHub's private reporting: open the **Security** tab of this repository and choose **Report a vulnerability**.
Only the maintainers can see what you send.

Please include:

- what you found and where (the address, tool or file);
- the steps to reproduce it;
- what someone could do with it.

Never include a real API key, sign-in code or token, yours or anyone else's. If one of your keys has been exposed,
regenerate it on the [RBAi Scholar page](https://thedreamlabinnovations.com/rbai-scholar): the old key stops working,
and apps connected with it are asked to sign in again.

## What we ask

- Test only with your own account and your own key.
- Don't read, change or delete anyone else's data.
- Keep the load small: no stress tests, and no automated scanning at high rates.
- Give us a reasonable time to fix the problem before you describe it in public.

We'll confirm that we received your report, keep you updated while we work on it, and credit you when the fix is
out if you'd like to be named.

## Scope

This repository holds the documentation, the client configurations and the benchmark. The search service's own
code isn't in it, but reports about the service are welcome through the same private form.
