@e2e @e2e_image
Feature: Native Termux Chromium can use a persistent Google Flow session
  Scenario: Manual login followed by one real image
    Given a Termux device explicitly enabled for interactive Flow acceptance
    When the user completes gflow auth login in visible Chromium
    Then gflow auth status verifies the saved session
    And gflow downloads one real image from Google Flow
