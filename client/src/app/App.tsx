// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { CommunicationUserIdentifier } from '@azure/communication-common';
import { ParticipantRole } from '@azure/communication-calling';
import { fromFlatCommunicationIdentifier, StartCallIdentifier } from '@azure/communication-react';

import { setLogLevel } from '@azure/logger';
import { initializeIcons, Spinner } from '@fluentui/react';
import { CallAdapterLocator } from '@azure/communication-react';
import React, { useEffect, useState } from 'react';
import {
  buildTime,
  callingSDKVersion,
  communicationReactSDKVersion,
  createGroupId,
  fetchTokenResponse,
  getGroupIdFromUrl,
  getTeamsLinkFromUrl,
  isLandscape,
  isOnIphoneAndNotSafari,
  navigateToHomePage,
  WEB_APP_TITLE
} from './utils/AppUtils';
import { createRoom, getRoomIdFromUrl, addUserToRoom } from './utils/AppUtils';
import { useIsMobile } from './utils/useIsMobile';
import { CallError } from './views/CallError';
import { CallScreen } from './views/CallScreen';
import { HomeScreen } from './views/HomeScreen';
import { UnsupportedBrowserPage } from './views/UnsupportedBrowserPage';

setLogLevel('error');

console.log(
  `ACS sample calling app. Last Updated ${buildTime} using @azure/communication-calling:${callingSDKVersion} and @azure/communication-react:${communicationReactSDKVersion}`
);

initializeIcons();

type AppPages = 'home' | 'call';

const App = (): JSX.Element => {
  const [page, setPage] = useState<AppPages>('home');

  // User credentials to join a call with - these are retrieved from the server
  const [token, setToken] = useState<string>();
  const [userId, setUserId] = useState<CommunicationUserIdentifier>();
  const [userCredentialFetchError, setUserCredentialFetchError] = useState<boolean>(false);

  // Call details to join a call - these are collected from the user on the home screen
  const [callLocator, setCallLocator] = useState<CallAdapterLocator>();
  const [targetCallees, setTargetCallees] = useState<StartCallIdentifier[]>([]);
  const [displayName, setDisplayName] = useState<string>('');

  // Get Azure Communications Service token from the server
  useEffect(() => {
    (async () => {
      try {
        const { token, user } = await fetchTokenResponse();
        setToken(token);
        setUserId(user);
      } catch (e) {
        console.error(e);
        setUserCredentialFetchError(true);
      }
    })();
  }, []);

  const isMobileSession = useIsMobile();
  const isLandscapeSession = isLandscape();

  useEffect(() => {
    if (isMobileSession && isLandscapeSession) {
      console.log('ACS Calling sample: Mobile landscape view is experimental behavior');
    }
  }, [isMobileSession, isLandscapeSession]);

  const supportedBrowser = !isOnIphoneAndNotSafari();
  if (!supportedBrowser) {
    return <UnsupportedBrowserPage />;
  }

  switch (page) {
    case 'home': {
      document.title = `home - ${WEB_APP_TITLE}`;
      // Show a simplified join home screen if joining an existing call
      const joiningExistingCall: boolean = !!getGroupIdFromUrl() || !!getTeamsLinkFromUrl() || !!getRoomIdFromUrl();
      return (
        <HomeScreen
          joiningExistingCall={joiningExistingCall}
          startCallHandler={async (callDetails) => {
            setDisplayName(callDetails.displayName);

            let callLocator: CallAdapterLocator | undefined =
              callDetails.callLocator ||
              getRoomIdFromUrl() ||
              getTeamsLinkFromUrl() ||
              getGroupIdFromUrl() ||
              createGroupId();

            if (callDetails.option === 'Rooms') {
              callLocator = getRoomIdFromUrl() || callDetails.callLocator;
            }

            if (callDetails.option === 'TeamsAdhoc') {
              const outboundTeamsUsers = callDetails.outboundTeamsUsers?.map((user) => {
                return fromFlatCommunicationIdentifier(user) as StartCallIdentifier;
              });
              callLocator = undefined;
              setTargetCallees(outboundTeamsUsers ?? []);
            }

            // There is an API call involved with creating a room so lets only create one if we know we have to
            if (callDetails.option === 'StartRooms') {
              let roomId = '';
              try {
                roomId = await createRoom();
              } catch (e) {
                console.log(e);
              }

              callLocator = { roomId: roomId };
            }

            if (callLocator && 'roomId' in callLocator) {
              if (userId && 'communicationUserId' in userId) {
                await addUserToRoom(
                  userId.communicationUserId,
                  callLocator.roomId,
                  callDetails.role as ParticipantRole
                );
              } else {
                throw 'Invalid userId!';
              }
            }

            setCallLocator(callLocator);

            // Update window URL to have a joinable link
            if (callLocator && !joiningExistingCall) {
              window.history.pushState({}, document.title, window.location.origin + getJoinParams(callLocator));
            }

            setPage('call');
          }}
        />
      );
    }

    case 'call': {
      if (userCredentialFetchError) {
        document.title = `error - ${WEB_APP_TITLE}`;
        return (
          <CallError
            title="Error getting user credentials from server"
            reason="Ensure the sample server is running."
            rejoinHandler={() => setPage('call')}
            homeHandler={navigateToHomePage}
          />
        );
      }

      if (!token || !userId || !displayName || (!targetCallees && !callLocator)) {
        document.title = `credentials - ${WEB_APP_TITLE}`;
        return <Spinner label={'Getting user credentials from server'} ariaLive="assertive" labelPosition="top" />;
      }
      return (
        <CallScreen
          token={token}
          userId={userId}
          displayName={displayName}
          callLocator={callLocator}
          targetCallees={targetCallees}
        />
      );
    }
    default:
      document.title = `error - ${WEB_APP_TITLE}`;
      return <>Invalid page</>;
  }
};

const getJoinParams = (locator: CallAdapterLocator): string => {
  if ('meetingLink' in locator) {
    return '?teamsLink=' + encodeURIComponent(locator.meetingLink);
  }

  if ('roomId' in locator) {
    return '?roomId=' + encodeURIComponent(locator.roomId);
  }

  return '?groupId=' + encodeURIComponent(locator.groupId);
};

export default App;
