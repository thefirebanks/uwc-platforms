**Project: Writing a better version of Survey Monkey Apply (SMA) for the Peruvian UWC selection process**

The Peruvian UWC selection process contains 5 stages:

1. Document submission (approx 500-600 applicants): This is where each applicant inputs basic information, uploads identification, answers application questions, uploads their school grades, and recommendation letters (these ones are uploaded by a professor/mentor, and a friend). There needs to be a validation step to ensure that all documents are complete, that the applicants meet the UWC selection process minimum application requirements (age, grades, nationality, etc).  
2. Written exam (around 500-600 applicants if they all meet the requirements): This is where we administer an academic exam to test the writing/reading/math/critical thinking skills of the applicants. For now, we won’t focus on this stage since we may use a separate software. However, we do need to keep this in the flow and at least have a way of inputting the applicants who will move to the next stage.  
3. Online weekend 1 (around 100 applicants): We’ll do group interviews, test the selection criteria through many online, real time activities. We have evaluators for this stage in addition to the committee, and we divide the applicants in groups of 10 or so, where 2 evaluators take care of each group. Here, we probably need 3 things:  
   1. A “packet” generator \- for each applicant, we need to have a way of displaying the main information so that the evaluators have a way of learning who they’ll be evaluating. This will be based on the information from the first stage. Also, the applicants will probably have some homework due before this stage and we should include this in this packet.  
   2. A roadmap page \- which includes the activities that will happen/their schedule, the packet for each applicant in a group, and anything we keep in spreadsheets or docs should just be in this platform  
   3. A decision platform \- once this stage is done, we need a way to help the evaluators send their “yes”, “maybe”, “no” ratings (with reasoning) and meeting the standards set by the committee/admins (e.g no more than 3 “yes-es” per group, the other “maybe”s can be discussed as an evaluator panel)   
4. Online weekend 2 (around 30 applicants):  
   1. Similar to the first online weekend, but with less applicants and with the packets containing comments from the previous stage  
5. Final interview with external jury (around 12 applicants):  
   1. Here we’ll probably just need a packet generator which will include comments from the previous stages  
   2. Also a ranking tool \- this is usually done through a spreadsheet but it would be ideal to do it in the platform instead  
6. Nominations to UWC (depending on scholarships assigned to Peru, around 6-9 applicants)   
   1. Here, we’ll basically need a way of exporting everything that we’d upload to either survey monkey apply or OpenApply (another platform we use for nomination), in a nice csv

Basic needs from this new platform:

* 3 modes: admin (for the committee), reviewer/evaluator (for the evaluators), and applicant  
  * Admins need to  
    * Be able to easily define what each form will have for the first stage  
    * Be able to generate packets  
    * Be able to assign homeworks to applicants (which will be uploads that they’ll do which will be stored directly in their account)  
    * Be able to write down roadmaps and templates. For now, we should be able to upload existing docs or sheets and the platform should be able to display them in a beautiful way, plus allow live edition a la google docs/sheets. In the end, we’ll just use this at the beginning to generate a template, and for every future selection process we’ll just re-use templates.   
  * Evaluators need to  
    * Be able to access packets  
    * Be able to review information from forms if needed  
  * Applicants need to be able to  
    * Upload files and fill out their information in the most convenient, fast way possible, with immediate validation if possible  
* Stage tracking \- the admins need to be able to easily move applicants from one stage to the next.  
  * Automations: As part of this, if we have an automation to send an email to people who passed vs not passed, this needs to work reliably, and have an easy way of being tested through a test account or another committee account  
* Needs to be easy to use, not too cluttered, and have fast download/upload of files.  
  * We won’t have thousands of users at a time so we need to offer a pristine, crisp experience to the few users we will have  
* Top of the line form filling and validation  
* Quick ways of exporting things: Mainly csv/excel files  
* VERY IMPORTANT: Needs to be easy to onboard and use, especially for the most basic use cases. Can’t have too much friction or require too much tutorial time

Some technical notes

* [Next.js](http://Next.js) application, typescript and tailwind. Prioritize material design when possible, needs to be clean, beautiful and sleek.  
* Supabase for auth and database  
* Cloudflare for hosting  
* For the first stage, we’ll probably need to use gemini 3 flash for some OCR document validation.  
* If we can use existing libraries for use cases that they are optimized for (e.g forms or document upload), let’s use the top of the line libraries please

