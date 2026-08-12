24observe Host Test Report

Date: 10 August 2026
Tester: Emil Thomas (GUI + Copilot)
Environment: Hosted dashboard (login.24observe.com), Windows host with WSL2 / Docker Desktop, Ubuntu container as a test host
Method: Manual host installer validation, Docker container testing, and host-related UI verification.

________________________________________________________________

Summary
-------
This report documents the 24observe host-related features and actions tested on 2026-08-11. The focus is on host installation, Docker container host validation, installer command correctness, and host enrollment verification.


1. Host installation and demo flow
----------------------------------
- Tested the 24observe host installer on an Ubuntu container host.
- Verified the correct demo install command:
  `curl -sSL https://api.24observe.com/install.sh | sudo bash -s -- --demo`
- Confirmed that `sudo bash bash --demo` is invalid and fails with `/usr/bin/bash: /usr/bin/bash: cannot execute binary file`.
- Validated that command syntax is critical for successful host onboarding.


2. Docker / container host validation
------------------------------------
- Used Docker Desktop and WSL2 to create an Ubuntu container for host testing.
- Installed the 24observe sensor inside the container to evaluate host onboarding.
- Confirmed the container host accepted the install flow.
- Observed that plain Ubuntu containers may not support `systemd` service checks like `systemctl status alloy`.
- Tested log ingestion from the Docker container host.


3. Host log ingestion testing
-----------------------------
- Verified that logs from the container host were sent to the platform.
- Tested nginx log ingestion from the host and confirmed the separate nginx install command flow.
- Confirmed that the host can generate logs for both container workloads and nginx service logs.
- Used separate install commands for the Docker container host and for nginx host log capture.


4. Host onboarding and enrollment verification
---------------------------------------------
- Checked the host onboarding path from the host/UI perspective.
- Confirmed that the host installer path is functional for a container host.
- Emphasized dashboard-based enrollment verification as the primary validation method when `systemd` is unavailable.


5. Host health / service behavior testing
----------------------------------------
- Tested host service verification commands in the container environment.
- Noted that service state checks are not fully reliable in Docker containers without full init support.
- Validated that host health verification should rely on dashboard host visibility and host metadata where possible.


6. Feature coverage
-------------------
- Host install command validation
- Demo installer flow
- Docker container host onboarding
- Docker container log ingestion
- nginx host log ingestion
- Host enrollment verification
- Host health/service check behavior in container environments
- Systemd compatibility caveat for container hosts


Results
-------
- The correct installer command was confirmed and documented.
- Ubuntu container host onboarding worked for the install path.
- Docker container logs and nginx host logs were tested and verified for ingestion.
- Invalid command execution was identified and clarified.
- Container host limitations with `systemd` were observed and captured.
- Dashboard host enrollment visibility remains the recommended verification step.


________________________________________________________________

