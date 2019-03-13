import io.appium.java_client.MobileElement;
import io.appium.java_client.ios.IOSDriver;

import org.openqa.selenium.WebDriverException;


public class BasicSetup {

	private static ThreadLocal<IOSDriver<MobileElement>> driverSession = new ThreadLocal<IOSDriver<MobileElement>>();
	private static ThreadLocal<MobileAppDriver> mobileAppDriverSession = new ThreadLocal<MobileAppDriver>();

	public MobileAppDriver() {
		mobileAppDriverSession.set(this);
	}
	
	
}
