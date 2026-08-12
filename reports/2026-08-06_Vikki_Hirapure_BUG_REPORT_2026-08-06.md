24observe Testing Report

Date: 06 August 2026
Tester: Vikki Hirapure (Manual QA Testing)
Environment: Hosted Dashboard (https://login.24observe.com)
Product: 24Observe Security Module
Method: Manual GUI testing of Security features by performing functional and validation testing.

Bug 1 — Threat Intelligence accepts invalid IP addresses

Severity: Medium

Type: Input Validation Bug

Status: Confirmed

What happened

While adding a Custom Indicator in the Threat Intelligence module, selecting the IP indicator type should only allow valid IPv4/IPv6 addresses.

Instead, the application accepts alphabetic characters, random text, and invalid IP formats without displaying any validation error.

What I tested
Open Security → Threat Intelligence.
Click Add Custom Indicator.
Select Type = IP.
Enter values such as:
abcdef
hello123
999.999.999.999
abc.123
Click Save.
What I observed

The application accepts invalid values and allows them to be saved.

No validation message is displayed.

Why this matters
Invalid IOC data can be stored in the database.
Detection rules may not work correctly.
Poor data quality affects investigations.
Users are not informed when an invalid IP address is entered.
Expected Result

The application should:

Accept only valid IPv4 or IPv6 addresses.
Reject invalid formats.
Display a clear validation message such as:

Please enter a valid IP address.

Bug 2 — Threat Intelligence Domain field accepts invalid values

Severity: Medium

Type: Input Validation Bug

Status: Confirmed

What happened

When selecting Domain as the indicator type, the input field accepts numeric values and invalid domain names.

What I tested
Open Security → Threat Intelligence.
Click Add Custom Indicator.
Select Type = Domain.
Enter values such as:
123456
987654
@@@@
1111
Save the record.
What I observed

The application saves invalid domain values without validation.

Why this matters
Incorrect IOC information can be stored.
Domain indicators become unreliable.
Users can accidentally save invalid data.
Expected Result

The application should validate domain names using proper domain format validation and reject invalid entries with an appropriate error message.

Bug 3 — Context Assets IP field accepts invalid IP and domain values

Severity: Medium

Type: Input Validation Bug

Status: Confirmed

What happened

Inside Security → Context → Assets, the IP Address field accepts domain names, random text, and invalid IP addresses.

What I tested
Navigate to Security → Context → Assets.
Create a new asset.
Enter values such as:
google.com
abcdef
999.999.999.999
test123
Save the asset.
What I observed

The asset is saved successfully even though the IP Address field contains invalid values.

Why this matters
Incorrect asset inventory.
Poor data integrity.
Network identification becomes inaccurate.
Users are allowed to store invalid IP information.
Expected Result

The IP Address field should only accept valid IPv4 or IPv6 addresses.

Invalid values should be rejected with an appropriate validation message.