**OriginX – GigShield – AI Parametric Insurance for Food Delivery Workers**

Guidewire DEVTrails Hackathon 2026

**Team OriginX**

1. SHRESTHA VERDHAN
2. ARPIT SINGH
3. RAMYA PATHAK
4. ARYABRATA KUNDU

**1. Introduction**

Food delivery partners working with platforms like Swiggy and Zomato depend on daily deliveries for their income. Since their work is completely outdoor-based, it is highly affected by environmental and external conditions.

Situations such as heavy rainfall, flooding, extreme heat, pollution, or sudden curfews can reduce their working hours and directly impact their earnings.

Currently, there is no straightforward system to help them recover this loss.

Our project proposes a parametric insurance platform that automatically compensates delivery workers when such disruptions occur.


**2. Problem Statement**

Gig workers face income instability due to external conditions that are beyond their control.

Common issues include:

. Heavy rain stopping deliveries

. Flooded roads making travel unsafe

. Extreme heat reducing work hours

. High pollution affecting outdoor activity

. Local curfews or area shutdowns

These disruptions can reduce earnings by 20–30%, and workers receive no compensation.

Traditional insurance does not solve this problem because:

. It does not cover income loss

. It requires manual claims

. It has slow payout cycles

**3. Proposed Solution**

GigShield is an AI-powered parametric insurance platform designed specifically for food delivery workers.

The system works automatically:

. The platform monitors real-time external conditions

. When a disruption crosses a defined threshold, a claim is triggered automatically

. The worker receives compensation instantly

Workers subscribe to a weekly insurance plan, and when conditions cross predefined thresholds, they receive payouts without any manual process.

**4. Key Innovation**

Most systems rely only on GPS to verify worker location, but GPS can be easily spoofed.

GigShield introduces a multi-layer verification system that combines:

. Location validation from multiple sources

. Delivery platform activity verification

. AI-based anomaly detection

. Controlled payout mechanism

This ensures that only genuine workers receive payouts, making the system reliable and fraud-resistant.


**5. Target Persona**

Our solution focuses on food delivery workers in urban areas.

Example Scenario

A delivery partner in Chennai is working during heavy rainfall. Due to flooded roads and reduced orders, the worker loses several hours of work.

GigShield detects that rainfall exceeds the defined threshold and verifies that the worker was active during that time.

The system then automatically compensates the worker for the lost income.


**6. Application Workflow**

 The system works as follows:

1. Worker registers on the platform

2. The system calculates the weekly premium based on risk

3. Worker subscribes to an insurance plan

4. Platform continuously monitors external conditions

5. When a disruption threshold is crossed, a claim is triggered

6. Multi-layer verification checks are performed

7. If valid, payout is processed instantly

8. If flagged, claim is sent for manual review


**7. Weekly Premium Model**

The system uses a weekly pricing model, aligned with gig worker income patterns.

Example Plans

Plan	   | Weekly Premium	  | Coverage

Basic	   |     ₹25	        | ₹300

Standard |     ₹40	        | ₹500

Premium	 |     ₹60	        | ₹700


Premiums are adjusted based on the risk level of the worker’s location.

**8. Parametric Triggers**

The system uses measurable conditions to trigger payouts.

Example Conditions: 

Event	          |        Trigger

Heavy Rain	    |   Rainfall > 50 mm

Extreme Heat	  |   Temperature > 42°C

High Pollution	|    AQI > 300

When these conditions are met, compensation is automatically initiated.

**9. Fraud Prevention Strategy**

Instead of relying only on GPS, GigShield uses a multi-layer fraud prevention approach:

. Device validation to detect spoofing or suspicious apps

. Multi-source location verification (GPS + network signals)

. Delivery platform activity check (active orders or recent work)

. AI-based anomaly detection for unusual claim patterns

. Controlled payout system with partial escrow

This approach significantly reduces the chances of fraudulent claims and ensures system reliability.

### Platform Dependency Handling

While delivery platform APIs (Swiggy/Zomato) improve verification accuracy, the system is designed to remain functional even without them.  

In cases where API access is unavailable or delayed, fallback validation using behavioural signals such as movement patterns, recent activity, and location consistency is used to ensure continuity.

**10. Platform Choice**

We are developing a web-based platform for this project.

Reason:

. Faster to develop within the hackathon timeline

. Easy to test and demonstrate

. Accessible on any device without installation

A mobile application can be considered for future development.


**11. AI / ML Integration**

AI is used in two main areas of the system to make it both adaptive and reliable.

**Risk Assessment**

The system analyzes:

. Historical weather data

. Location-based environmental risks

. Frequency of past disruptions in a specific area

Based on these factors, it assigns a risk score to each location.
This risk score is then used to dynamically adjust the weekly premium, ensuring that pricing reflects real-world conditions.

**Fraud Detection**

To prevent misuse of the system, AI is used to identify suspicious or abnormal behavior.

The system checks:

. Consistency of location data across multiple sources

. Claim frequency patterns of individual users

. Mismatch between actual disruption events and user activity

If unusual patterns are detected, the claim is either flagged for review or temporarily held, reducing the chances of fraudulent payouts.

### Dynamic Risk Control

The system includes a circuit breaker mechanism to prevent coordinated fraud.  

Instead of using fixed thresholds, the limits are dynamically adjusted based on zone size, number of active workers, and historical activity patterns to avoid blocking genuine claims during large-scale events such as floods.

**12. Technology Stack**


**Frontend**
React.js

**Backend**
Node.js with Express

**Database**
MongoDB

**External APIs**
Weather API (rainfall, temperature)
Pollution API (AQI)

**AI / ML**
Python for risk analysis and anomaly detection

**Payments**
Razorpay (sandbox mode)

**13. System Architecture**
![PHOTO-2026-03-20-21-27-40](https://github.com/user-attachments/assets/9107d99c-d7ef-4b40-bc98-940dc99d9e12)


This architecture shows how different components of the system interact, including user applications, backend services, AI modules, external APIs, and payment systems.

**14. Workflow Diagram**
![PHOTO-2026-03-20-21-37-15](https://github.com/user-attachments/assets/97824b2b-dddb-4aa1-9db9-ee80a4e600ad)


**14. Development Plan**

**Phase 1 – Ideation**

. Research and problem understanding

. Persona selection

. System design

. AI planning

. Repository setup

**Phase 2 – Core Features**

. User registration

. Policy creation

. Premium calculation

. Disruption detection

. Claim system

**Phase 3 – Enhancement**

. Advanced fraud detection

. Payment integration

. Dashboard for users and admin

. Predictive insights

**15. Additional Notes**

The system focuses only on income loss, not health or vehicle damage

The claim process is fully automated

The solution is scalable to other gig worker categories in the future

**16. Privacy Considerations**

The system is designed with user privacy in mind.  

Only necessary data is collected for verification, and all sensitive information is encrypted and processed with user consent. The system avoids storing unnecessary personal data.

**17. Demo Video**

